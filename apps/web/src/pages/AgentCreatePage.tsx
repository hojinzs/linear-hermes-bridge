import {
  Button,
  Group,
  JsonInput,
  Select,
  Stack,
  TagsInput,
  TextInput,
  Textarea,
  Title,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { SecretInput } from "../components/SecretInput";

type FormValues = {
  slug: string;
  displayName: string;
  description: string;
  linearClientId: string;
  linearClientSecret: string;
  linearWebhookSecret: string;
  requiredScopes: string[];
  hermesConnectorType: "mock" | "localWebhook" | "apiServer" | "cli";
  hermesConnectorConfig: string;
  permissionPolicy: string;
};

export function AgentCreatePage() {
  const navigate = useNavigate();
  const form = useForm<FormValues>({
    initialValues: {
      slug: "",
      displayName: "",
      description: "",
      linearClientId: "",
      linearClientSecret: "",
      linearWebhookSecret: "",
      requiredScopes: ["read", "comments:create", "app:mentionable", "app:assignable"],
      hermesConnectorType: "mock",
      hermesConnectorConfig: '{ "kind": "mock" }',
      permissionPolicy: '{ "defaultMode": "plan-only" }',
    },
    validate: {
      slug: (v) => (!/^[a-z0-9-]+$/.test(v) ? "lowercase, digits, hyphen only" : null),
      displayName: (v) => (v.trim() === "" ? "required" : null),
      linearClientId: (v) => (v.trim() === "" ? "required" : null),
      linearClientSecret: (v) => (v.length < 1 ? "required" : null),
      linearWebhookSecret: (v) => (v.length < 1 ? "required" : null),
      hermesConnectorConfig: (v) => {
        try {
          JSON.parse(v);
          return null;
        } catch {
          return "must be valid JSON";
        }
      },
      permissionPolicy: (v) => {
        try {
          JSON.parse(v);
          return null;
        } catch {
          return "must be valid JSON";
        }
      },
    },
  });

  async function onSubmit(values: FormValues) {
    try {
      const created = await api.agents.create({
        slug: values.slug,
        displayName: values.displayName,
        description: values.description || null,
        iconUrl: null,
        linearClientId: values.linearClientId,
        linearClientSecret: values.linearClientSecret,
        linearWebhookSecret: values.linearWebhookSecret,
        requiredScopes: values.requiredScopes,
        hermesConnectorType: values.hermesConnectorType,
        hermesConnectorConfig: JSON.parse(values.hermesConnectorConfig),
        permissionPolicy: JSON.parse(values.permissionPolicy),
      });
      notifications.show({ color: "green", message: `Created ${created.agent.slug}` });
      navigate(`/agents/${created.agent.slug}`);
    } catch (e) {
      notifications.show({ color: "red", message: (e as Error).message });
    }
  }

  return (
    <Stack maw={680}>
      <Title order={2}>New agent</Title>
      <form onSubmit={form.onSubmit(onSubmit)}>
        <Stack>
          <TextInput label="Slug" required {...form.getInputProps("slug")} />
          <TextInput label="Display name" required {...form.getInputProps("displayName")} />
          <Textarea
            label="Description"
            autosize
            minRows={2}
            {...form.getInputProps("description")}
          />
          <TextInput label="Linear client ID" required {...form.getInputProps("linearClientId")} />
          <SecretInput
            label="Linear client secret"
            required
            {...form.getInputProps("linearClientSecret")}
          />
          <SecretInput
            label="Linear webhook secret"
            required
            {...form.getInputProps("linearWebhookSecret")}
          />
          <TagsInput label="Required scopes" {...form.getInputProps("requiredScopes")} />
          <Select
            label="Hermes connector type"
            data={["mock", "localWebhook", "apiServer", "cli"]}
            {...form.getInputProps("hermesConnectorType")}
          />
          <JsonInput
            label="Connector config (JSON)"
            autosize
            minRows={3}
            {...form.getInputProps("hermesConnectorConfig")}
          />
          <JsonInput
            label="Permission policy (JSON)"
            autosize
            minRows={3}
            {...form.getInputProps("permissionPolicy")}
          />
          <Group justify="flex-end">
            <Button type="submit">Create</Button>
          </Group>
        </Stack>
      </form>
    </Stack>
  );
}
