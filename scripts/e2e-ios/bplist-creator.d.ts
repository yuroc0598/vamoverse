declare module 'bplist-creator' {
  /** Serializes a value (objects, arrays, strings, numbers, booleans, Buffers) to a binary plist. */
  export default function bplistCreator(value: unknown): Buffer
}
