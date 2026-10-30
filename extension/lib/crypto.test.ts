import { describe, it, expect } from "vitest";
import { generateKey, encrypt, decrypt, decryptFrom } from "./crypto";

const message = { type: "contact", firstName: "Alice" };

describe("sender binding", () => {
  it("round-trips a message bound to each sender", async () => {
    const key = await generateKey();
    for (const sender of ["extension", "browser"] as const) {
      const ciphertext = await encrypt(key, message, sender);
      expect(await decrypt(key, ciphertext.buffer, sender)).toEqual(message);
      expect(await decryptFrom(key, ciphertext.buffer, sender)).toEqual(
        message,
      );
    }
  });

  it("rejects a message reflected back to the side that sent it", async () => {
    const key = await generateKey();
    const ciphertext = await encrypt(key, message, "extension");
    await expect(decrypt(key, ciphertext.buffer, "browser")).rejects.toThrow();
    await expect(
      decryptFrom(key, ciphertext.buffer, "browser"),
    ).rejects.toThrow();
  });

  it("rejects a bound message where an unbound one is expected", async () => {
    const key = await generateKey();
    const ciphertext = await encrypt(key, message, "extension");
    await expect(decrypt(key, ciphertext.buffer)).rejects.toThrow();
  });

  it("still accepts unbound messages from an older connect page", async () => {
    const key = await generateKey();
    const ciphertext = await encrypt(key, message);
    expect(await decryptFrom(key, ciphertext.buffer, "browser")).toEqual(
      message,
    );
  });

  it("rejects a message under another key", async () => {
    const ciphertext = await encrypt(await generateKey(), message);
    await expect(
      decryptFrom(await generateKey(), ciphertext.buffer, "browser"),
    ).rejects.toThrow();
  });
});
