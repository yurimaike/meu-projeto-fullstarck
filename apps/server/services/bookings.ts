import { randomBytes, randomUUID } from "node:crypto";
import { DatabaseError, executeSql } from "../_core/db";

export const BOOKING_TIMES = ["08:00", "09:30", "11:00", "13:00", "14:30", "16:00", "17:30", "19:00"] as const;
export const BOOKING_SERVICES = ["Manicure e pedicure", "Esmaltação em gel", "Banho de gel", "Manutenção"] as const;
export type BookingInput = { customerName:string; customerEmail:string; customerPhone:string; bookingDate:string; bookingTime:typeof BOOKING_TIMES[number]; service:typeof BOOKING_SERVICES[number] };
function validDate(s:string) { if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false; const d=new Date(`${s}T12:00:00`); return !Number.isNaN(d.getTime()) && d.toISOString().slice(0,10)===s; }
function ensureDateTime(date:string,time:string) { if(!validDate(date)) throw new DatabaseError("INVALID_INPUT","Data inválida.",400); const target=new Date(`${date}T${time}:00-03:00`); if(target.getTime()<=Date.now()) throw new DatabaseError("INVALID_INPUT","Escolha uma data e horário futuros.",400); }
export async function listBusyTimes(date:string) { if(!validDate(date)) throw new DatabaseError("INVALID_INPUT","Data inválida.",400); const r=await executeSql("SELECT bookingTime FROM bookings WHERE bookingDate = ? AND status IN ('pending','confirmed')",[date]); return r.rows.map(x=>String(x.bookingTime)); }
export async function createBooking(input:BookingInput, verifiedUser?:{id:string;email:string}) {
  ensureDateTime(input.bookingDate,input.bookingTime);
  if(!BOOKING_TIMES.includes(input.bookingTime)||!BOOKING_SERVICES.includes(input.service)) throw new DatabaseError("INVALID_INPUT","Serviço ou horário inválido.",400);
  const name=input.customerName.trim(); const email=input.customerEmail.trim().toLowerCase(); const phone=input.customerPhone.replace(/\D/g,"");
  if(name.length<2||name.length>120||!/^\S+@\S+\.\S+$/.test(email)||phone.length<10||phone.length>13) throw new DatabaseError("INVALID_INPUT","Confira nome, e-mail e WhatsApp.",400);
  const id=randomUUID(); const bookingCode=`LET-${randomBytes(4).toString("hex").toUpperCase()}`;
  const userId = verifiedUser && verifiedUser.email.toLowerCase() === email ? verifiedUser.id : null;
  try { await executeSql("INSERT INTO bookings (id,bookingCode,customerName,customerEmail,customerPhone,bookingDate,bookingTime,service,status,userId) VALUES (?,?,?,?,?,?,?,?, 'pending',?)",[id,bookingCode,name,email,phone,input.bookingDate,input.bookingTime,input.service,userId]); }
  catch(e) {
    if (e instanceof DatabaseError && e.code === "SLOT_UNAVAILABLE") throw e;
    const msg = e instanceof DatabaseError ? e.databaseMessage : e instanceof Error ? e.message : "";
    if (/uq_bookings_active_slot|unique constraint failed:\s*bookings\.bookingDate,\s*bookings\.bookingTime/i.test(msg)) {
      throw new DatabaseError("SLOT_UNAVAILABLE", "Este horário acabou de ser reservado. Escolha outro.", 409);
    }
    throw e;
  }
  return { id, bookingCode, customerName:name, customerEmail:email, customerPhone:phone, bookingDate:input.bookingDate, bookingTime:input.bookingTime, service:input.service, status:"pending" as const };
}
export async function listBookings() { const r=await executeSql("SELECT id,bookingCode,customerName,customerEmail,customerPhone,bookingDate,bookingTime,service,status,createdAt,updatedAt,decidedAt,decisionNote FROM bookings ORDER BY bookingDate DESC, bookingTime DESC"); return r.rows; }
export async function listCustomerBookings(userId:string, verifiedEmail:string) {
  if (!userId || !verifiedEmail.trim()) throw new DatabaseError("INVALID_INPUT","Verified identity is required.",400);
  const normalizedEmail = verifiedEmail.trim().toLowerCase();
  const result = await executeSql(
    "SELECT id,bookingDate,bookingTime,service,status,createdAt,updatedAt FROM bookings WHERE userId = ? OR (userId IS NULL AND lower(customerEmail) = ?) ORDER BY bookingDate DESC, bookingTime DESC LIMIT 100",
    [userId, normalizedEmail]
  );
  return result.rows;
}
export async function decideBooking(id:string, action:"confirmed"|"rejected"|"cancelled", note?:string) {
  const r=await executeSql("UPDATE bookings SET status=?, updatedAt=CURRENT_TIMESTAMP, decidedAt=CURRENT_TIMESTAMP, decisionNote=? WHERE id=? AND (status='pending' OR (status='confirmed' AND ?='cancelled'))",[action,note?.slice(0,500)??null,id,action]);
  if(Number(r.rowsAffected)!==1) throw new DatabaseError("BOOKING_NOT_PENDING","Reserva não encontrada ou já decidida.",409);
  const result=await executeSql("SELECT id,bookingCode,customerName,customerEmail,customerPhone,bookingDate,bookingTime,service FROM bookings WHERE id=?",[id]);
  const row=result.rows[0];
  if(!row) throw new DatabaseError("DATABASE_QUERY_FAILED","Reserva atualizada, mas não encontrada para notificação.",502);
  return {
    id:String(row.id),
    bookingCode:String(row.bookingCode),
    customerName:String(row.customerName),
    customerEmail:String(row.customerEmail),
    customerPhone:String(row.customerPhone),
    bookingDate:String(row.bookingDate),
    bookingTime:String(row.bookingTime),
    service:String(row.service),
    status:action,
    note:note?.slice(0,500)
  };
}
