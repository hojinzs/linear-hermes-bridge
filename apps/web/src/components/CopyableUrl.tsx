import { ActionIcon, CopyButton, Group, Text, Tooltip } from "@mantine/core";
import { IconCheck, IconCopy } from "@tabler/icons-react";

export function CopyableUrl({ label, url }: { label: string; url: string }) {
  return (
    <Group gap="xs" wrap="nowrap">
      <Text size="sm" c="dimmed" w={120}>
        {label}
      </Text>
      <Text size="sm" style={{ wordBreak: "break-all", flex: 1 }}>
        {url}
      </Text>
      <CopyButton value={url} timeout={1500}>
        {({ copied, copy }) => (
          <Tooltip label={copied ? "Copied" : "Copy"}>
            <ActionIcon variant="subtle" onClick={copy}>
              {copied ? <IconCheck size={16} /> : <IconCopy size={16} />}
            </ActionIcon>
          </Tooltip>
        )}
      </CopyButton>
    </Group>
  );
}
