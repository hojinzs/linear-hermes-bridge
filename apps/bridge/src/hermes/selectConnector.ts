import type { HermesConnector } from "./connector.js";
import { localWebhookConnector } from "./localWebhookConnector.js";
import { mockConnector } from "./mockConnector.js";

export type SelectConnectorInput = {
  agentSlug: string;
  hermesConnectorType: string;
  hermesConnectorConfig: unknown;
  slow?: boolean;
};

export function selectConnector(input: SelectConnectorInput): HermesConnector {
  switch (input.hermesConnectorType) {
    case "mock":
      return mockConnector({ slow: input.slow ?? false });
    case "localWebhook":
      return localWebhookConnector(input.hermesConnectorConfig);
    case "apiServer":
      throw new Error(
        `connector type "${input.hermesConnectorType}" not implemented in this slice`,
      );
    default:
      throw new Error(`unknown connector type: ${input.hermesConnectorType}`);
  }
}
