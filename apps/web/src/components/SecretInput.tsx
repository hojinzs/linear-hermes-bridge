import { PasswordInput, type PasswordInputProps } from "@mantine/core";

export function SecretInput(props: PasswordInputProps) {
  return <PasswordInput {...props} autoComplete="new-password" />;
}
