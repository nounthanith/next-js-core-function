export interface FieldRule {
    required?: boolean;
    type?: "string" | "number" | "boolean" | "email";
    minLength?: number;
    maxLength?: number;
    min?: number;
    max?: number;
    pattern?: RegExp;
    enum?: readonly string[];
}

export type ValidationSchema = Record<string, FieldRule>;

export type ValidationResult<T> =
    | { ok: true; data: T }
    | { ok: false; errors: Record<string, string> };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(email: string): boolean {
    return EMAIL_RE.test(email);
}

export function validate<T = Record<string, unknown>>(
    input: unknown,
    schema: ValidationSchema
): ValidationResult<T> {
    if (typeof input !== "object" || input === null || Array.isArray(input)) {
        return { ok: false, errors: { _: "Body must be an object" } };
    }

    const source = input as Record<string, unknown>;
    const errors: Record<string, string> = {};
    const data: Record<string, unknown> = {};

    for (const [field, rule] of Object.entries(schema)) {
        const value = source[field];

        if (value === undefined || value === null || value === "") {
            if (rule.required) errors[field] = `${field} is required`;
            continue;
        }

        switch (rule.type) {
            case "string":
            case "email": {
                if (typeof value !== "string") {
                    errors[field] = `${field} must be a string`;
                    continue;
                }
                const str = value.trim();
                if (rule.minLength !== undefined && str.length < rule.minLength) {
                    errors[field] = `${field} must be at least ${rule.minLength} characters`;
                    continue;
                }
                if (rule.maxLength !== undefined && str.length > rule.maxLength) {
                    errors[field] = `${field} must be at most ${rule.maxLength} characters`;
                    continue;
                }
                if (rule.type === "email" && !EMAIL_RE.test(str)) {
                    errors[field] = `${field} must be a valid email`;
                    continue;
                }
                if (rule.pattern && !rule.pattern.test(str)) {
                    errors[field] = `${field} format is invalid`;
                    continue;
                }
                if (rule.enum && !rule.enum.includes(str)) {
                    errors[field] = `${field} must be one of: ${rule.enum.join(", ")}`;
                    continue;
                }
                data[field] = str;
                break;
            }
            case "number": {
                const num =
                    typeof value === "string" && value.trim() !== "" ? Number(value) : value;
                if (typeof num !== "number" || !Number.isFinite(num)) {
                    errors[field] = `${field} must be a number`;
                    continue;
                }
                if (rule.min !== undefined && num < rule.min) {
                    errors[field] = `${field} must be at least ${rule.min}`;
                    continue;
                }
                if (rule.max !== undefined && num > rule.max) {
                    errors[field] = `${field} must be at most ${rule.max}`;
                    continue;
                }
                data[field] = num;
                break;
            }
            case "boolean": {
                if (typeof value !== "boolean") {
                    errors[field] = `${field} must be a boolean`;
                    continue;
                }
                data[field] = value;
                break;
            }
            default: {
                data[field] = value;
            }
        }
    }

    if (Object.keys(errors).length > 0) {
        return { ok: false, errors };
    }
    return { ok: true, data: data as T };
}
