import { Alert } from "@mantine/core";
import { IconAlertTriangle } from "@tabler/icons-react";

export function DevBanner() {
  return (
    <Alert
      color="yellow"
      icon={<IconAlertTriangle size={16} />}
      radius={0}
      title="Development build"
      styles={{ root: { borderRadius: 0 } }}
    >
      auth not implemented · localhost-only · do not expose publicly
    </Alert>
  );
}
