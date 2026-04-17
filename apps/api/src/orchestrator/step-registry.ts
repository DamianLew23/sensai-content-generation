import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { STEP_HANDLERS, type StepHandler } from "./step-handler";

@Injectable()
export class StepRegistry {
  private readonly byType: Map<string, StepHandler>;

  constructor(@Inject(STEP_HANDLERS) handlers: StepHandler[]) {
    this.byType = new Map(handlers.map((h) => [h.type, h]));
  }

  resolve(type: string): StepHandler {
    const h = this.byType.get(type);
    if (!h) throw new NotFoundException(`No step handler registered for type: ${type}`);
    return h;
  }
}
