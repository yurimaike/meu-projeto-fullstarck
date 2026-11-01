import { build } from "vite";

process.env.SERVER_BUILD_TARGET = "render";
await build();
