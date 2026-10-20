import { NextResponse } from "next/server";

export interface ApiSuccess<T> {
    success: true;
    data: T;
    message?: string;
}

export interface ApiError {
    success: false;
    error: string;
    details?: unknown;
}

export function success<T>(data: T, status = 200, message?: string) {
    return NextResponse.json<ApiSuccess<T>>(
        { success: true, data, ...(message && { message }) },
        { status }
    );
}

export function error(message: string, status = 400, details?: unknown) {
    return NextResponse.json<ApiError>(
        { success: false, error: message, ...(details !== undefined && { details }) },
        { status }
    );
}

// Common shortcuts
export const unauthorized = (message = "Unauthorized") => error(message, 401);
export const forbidden = (message = "Forbidden") => error(message, 403);
export const notFound = (message = "Not found") => error(message, 404);
export const serverError = (message = "Internal server error") => error(message, 500);