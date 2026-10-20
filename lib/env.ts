function required(name: string): string {
    const value = process.env[name];
    if (!value) {
        throw new Error(`Missing environment variable: ${name} (set it in .env.local)`);
    }
    return value;
}

export const env = {
    NODE_ENV: process.env.NODE_ENV ?? "development",
    MONGODB_URI: required("MONGODB_URI"),
    JWT_SECRET: required("JWT_SECRET"),
    isProduction: process.env.NODE_ENV === "production",
};
