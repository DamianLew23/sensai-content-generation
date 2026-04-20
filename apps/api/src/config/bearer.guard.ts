import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { loadEnv } from "./env";

@Injectable()
export class BearerGuard implements CanActivate {
  private readonly token: string;
  constructor() {
    this.token = loadEnv().API_BEARER_TOKEN;
  }

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<{ headers: Record<string, string> }>();
    const auth = req.headers.authorization ?? "";
    const [scheme, value] = auth.split(" ");
    if (scheme !== "Bearer" || value !== this.token) {
      throw new UnauthorizedException("Invalid bearer token");
    }
    return true;
  }
}
