import { NestFactory } from "@nestjs/core";
import { Logger } from "nestjs-pino";
import { AppModule } from "./app.module";
import { loadEnv } from "./config/env";

async function bootstrap() {
  const env = loadEnv();
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  app.enableCors({
    origin: env.WEB_ORIGIN.split(",").map((o) => o.trim()),
    credentials: false,
  });
  await app.listen(env.PORT);
  app.get(Logger).log(`API listening on http://localhost:${env.PORT}`);
}

bootstrap();
