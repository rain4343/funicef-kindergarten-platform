import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

export default createMiddleware(routing);

export const config = {
  matcher: ["/", "/(en|ar|ckb)/:path*", "/((?!api|backend|_next|_vercel|.*\\..*).*)"],
};
