/** @readonly */
export function hello(name: string, year: number): string {
    return `Hello ${name}, welcome to ${year}`
}

/** @readonly */
export function bye(name: string): string {
    return `Bye ${name}!`;
}

export async function sendEmail (email: string): Promise<string> {
    return `Email sent to: ${email}!`;
}