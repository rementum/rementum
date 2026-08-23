export class DomainError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 400,
    readonly detail?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "DomainError";
  }
}

export class NotFoundError extends DomainError {
  constructor(resource: string) {
    super("not_found", `${resource} was not found`, 404);
  }
}

export class ForbiddenError extends DomainError {
  constructor(message = "You do not have permission to perform this action") {
    super("forbidden", message, 403);
  }
}

export class ConflictError extends DomainError {
  constructor(message: string, detail?: Record<string, unknown>) {
    super("conflict", message, 409, detail);
  }
}
