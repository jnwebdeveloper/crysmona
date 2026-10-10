export const bad = (message: string, status = 400) =>
  Object.assign(new Error(message), { status });
