// A notification id as the guest shim makes it. Zod-free on purpose: the sandboxed guest preload
// imports it, and it must bundle nothing but itself.
export const NID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/
