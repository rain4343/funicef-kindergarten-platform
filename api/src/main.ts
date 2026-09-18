import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import { AppModule } from "./app.module";

// لەسەر Vercel پێویست بە خوێندنەوەی فایلی .env ناکات
// چونکە ڤێرسڵ خۆی گۆڕاوە ژینگەیییەکان دەخاتە ناو process.env ڕاستەوخۆوە.

async function bootstrap() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required. Check your Vercel Environment Variables.");
  }

  const app = await NestFactory.create(AppModule);
  
  app.enableCors({
    origin: process.env.WEB_ORIGIN ?? "http://localhost:3000",
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // لەسەر Vercel پێویست ناکات پۆرت دیاری بکەین، بەڵام بۆ ئەوەی لۆکاڵیش کار بکات دەیهێڵینەوە
  const port = process.env.PORT || process.env.API_PORT || 4000;
  await app.listen(Number(port));
}

void bootstrap();
