import { Hono, type Context } from "hono";
import { randomInt } from "node:crypto";
import { z } from "zod";
import { apiFailure, apiSuccess } from "@repo/shared/http";
import { DatabaseError, executeSql } from "../_core/db";
import { adminRoute, protectedRoute, publicRoute } from "../_core/route-helpers";
import { distributedRateLimit, identityRateLimitCounter, ipRateLimitCounter } from "../middlewares/distributed-rate-limit";
import { BOOKING_SERVICES, BOOKING_TIMES, createBooking, decideBooking, listBookings, listBusyTimes, listCustomerBookings } from "../services/bookings";
import { notifyAdminsNewBooking, notifyBookingDecision } from "../services/booking-email";
import { bodySizeLimit } from "../middlewares/body-size-limit";
import { consumeGuestBookingChallenge, deleteGuestBookingChallenge, storeGuestBookingChallenge, UpstashUnavailableError } from "../services/upstash-redis";
import { sendGuestBookingAccessCode } from "../services/message";

export const bookingsRouter = new Hono();
const bookingLookupLimit = distributedRateLimit((c) => [ipRateLimitCounter(c, "bookings:lookup", 60, 60)]);
const bookingCreateLimit = distributedRateLimit((c) => [
  ipRateLimitCounter(c, "bookings:create", 5, 600),
  ipRateLimitCounter(c, "bookings:create-hour", 20, 3600)
]);
const adminReadLimit = distributedRateLimit((c) => [
  identityRateLimitCounter("bookings:admin-read", c.var.currentUser?.id, 60, 60)
]);
const adminWriteLimit = distributedRateLimit((c) => [
  identityRateLimitCounter("bookings:admin-write", c.var.currentUser?.id, 30, 60)
]);
const createSchema=z.object({customerName:z.string().trim().min(2).max(120),customerEmail:z.string().email().max(254),customerPhone:z.string().min(10).max(20),bookingDate:z.string(),bookingTime:z.enum(BOOKING_TIMES),service:z.enum(BOOKING_SERVICES)});
const decisionSchema=z.object({action:z.enum(["confirmed","rejected","cancelled"]),note:z.string().max(500).optional()});
const guestAccessSchema=z.object({email:z.string().trim().email().max(254),code:z.string().regex(/^\d{6}$/).optional()});
function parsedBody(c:Context){const raw=c.get("rawBody") as Uint8Array|undefined;if(!raw)return null;try{return JSON.parse(new TextDecoder().decode(raw)) as unknown;}catch{return null;}}
function guestEmailFromRequest(c:Context){const parsed=guestAccessSchema.safeParse(parsedBody(c));return parsed.success?parsed.data.email.toLowerCase():"invalid-email";}
const guestAccessRequestRateLimit=distributedRateLimit((c)=>{const email=guestEmailFromRequest(c);return [ipRateLimitCounter(c,"guest-booking-code:request-ip",5,3600),identityRateLimitCounter("guest-booking-code:request-email",email,3,3600),identityRateLimitCounter("guest-booking-code:cooldown",email,1,60)];});
const guestAccessVerifyRateLimit=distributedRateLimit((c)=>{const email=guestEmailFromRequest(c);return [ipRateLimitCounter(c,"guest-booking-code:verify-ip",10,3600),identityRateLimitCounter("guest-booking-code:verify-email",email,10,3600)];});
function fail(error:unknown,c:Context){if(error instanceof DatabaseError)return c.json(apiFailure(error.code,error.message),error.status as 400|403|404|409|502|503);throw error;}
const lookup=async(c:Context)=>{const date=c.req.query("date");if(!date)return c.json(apiFailure("INVALID_INPUT","Informe a data AAAA-MM-DD."),400);try{return c.json(apiSuccess({date,busyTimes:await listBusyTimes(date)}));}catch(e){return fail(e,c);}};
bookingsRouter.get("",publicRoute,bookingLookupLimit,lookup);
bookingsRouter.get("/",publicRoute,bookingLookupLimit,lookup);
const create=async(c:Context)=>{const parsed=createSchema.safeParse(await c.req.json().catch(()=>null));if(!parsed.success)return c.json(apiFailure("INVALID_INPUT","Preencha nome, e-mail, WhatsApp, data, serviço e horário."),400);try{const user=c.var.user; const verifiedUser=user?.emailVerified?{id:user.id,email:user.email}:undefined; const booking=await createBooking(parsed.data,verifiedUser); void notifyAdminsNewBooking(booking).catch(error=>console.error("[bookings] admin notification failed",error)); return c.json(apiSuccess(booking),201);}catch(e){return fail(e,c);}};
bookingsRouter.post("",publicRoute,bookingCreateLimit,create);bookingsRouter.post("/",publicRoute,bookingCreateLimit,create);
bookingsRouter.post("/guest-access/request-code",publicRoute,bodySizeLimit,guestAccessRequestRateLimit,async c=>{const parsed=guestAccessSchema.safeParse(parsedBody(c));if(!parsed.success)return c.json(apiFailure("INVALID_INPUT","Informe um e-mail válido."),400);const email=parsed.data.email.toLowerCase();const code=String(randomInt(100000,1000000));try{await storeGuestBookingChallenge(email,code);await sendGuestBookingAccessCode(email,code);return c.json(apiSuccess({message:"Se houver uma reserva para este endereço, enviaremos um código de acesso."}),202);}catch(error){await deleteGuestBookingChallenge(email).catch(()=>undefined);if(error instanceof UpstashUnavailableError)return c.json(apiFailure("BOOKING_ACCESS_UNAVAILABLE","A consulta está temporariamente indisponível."),503);return c.json(apiFailure("BOOKING_ACCESS_UNAVAILABLE","Não foi possível enviar o código agora. Tente novamente mais tarde."),503);}});
bookingsRouter.post("/guest-access/verify-code",publicRoute,bodySizeLimit,guestAccessVerifyRateLimit,async c=>{const parsed=guestAccessSchema.extend({code:z.string().regex(/^\d{6}$/)}).safeParse(parsedBody(c));if(!parsed.success)return c.json(apiFailure("INVALID_INPUT","Confira o e-mail e o código de seis dígitos."),400);const email=parsed.data.email.toLowerCase();try{const valid=await consumeGuestBookingChallenge(email,parsed.data.code);if(!valid)return c.json(apiFailure("ACCESS_CODE_INVALID","O código é inválido, expirou ou já foi usado."),400);const result=await executeSql("SELECT id,bookingDate,bookingTime,service,status,createdAt,updatedAt FROM bookings WHERE lower(customerEmail) = ? ORDER BY bookingDate DESC, bookingTime DESC LIMIT 100",[email]);return c.json(apiSuccess({bookings:result.rows}),200);}catch{return c.json(apiFailure("BOOKING_ACCESS_UNAVAILABLE","A consulta está temporariamente indisponível."),503);}});
bookingsRouter.get("/admin",adminRoute,adminReadLimit,async c=>{try{return c.json(apiSuccess({bookings:await listBookings()}));}catch(e){return fail(e,c);}});
bookingsRouter.get("/mine",protectedRoute,distributedRateLimit((c)=>[identityRateLimitCounter("bookings:mine",c.var.currentUser?.id,60,60)]),async c=>{const user=c.var.currentUser;if(!user.emailVerified)return c.json(apiFailure("EMAIL_NOT_VERIFIED","Verifique seu e-mail para acessar suas reservas."),403);try{return c.json(apiSuccess({bookings:await listCustomerBookings(user.id,user.email)}));}catch(e){return fail(e,c);}});
bookingsRouter.patch("/:id/status",adminRoute,adminWriteLimit,async c=>{const parsed=decisionSchema.safeParse(await c.req.json().catch(()=>null));if(!parsed.success)return c.json(apiFailure("INVALID_INPUT","Ação inválida."),400);try{const booking=await decideBooking(c.req.param("id"),parsed.data.action,parsed.data.note); void notifyBookingDecision(booking).catch(error=>console.error("[bookings] decision notification failed",error)); return c.json(apiSuccess({booking}));}catch(e){return fail(e,c);}});
