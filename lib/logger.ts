// Centralised logger. debug/warn are dev-only; error always logs.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Args = any[]

export const logger = {
  debug: (...args: Args) => {
    if (process.env.NODE_ENV === 'development') console.log(...args)
  },
  warn: (...args: Args) => {
    if (process.env.NODE_ENV === 'development') console.warn(...args)
  },
  error: (...args: Args) => {
    console.error(...args)
  },
}
