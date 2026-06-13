export interface ServiceDto {
  id: string
  name: string
  baseUrl: string
  specPath: string
  active: boolean
  createdAt: string
  status: "HEALTHY" | "DRIFTED" | "UNREACHABLE" | "PARSE_FAILED" | "UNKNOWN"
  breakingDriftCount: number
}

export interface SnapshotDto {
  id: string
  serviceId: string
  serviceName: string
  specHash: string
  fetchedAt: string
  fetchStatus: "FETCHED" | "UNREACHABLE" | "PARSE_FAILED"
}

export type ChangeType =
  | "PATH_REMOVED"
  | "RESPONSE_FIELD_REMOVED"
  | "RESPONSE_FIELD_TYPE_CHANGED"
  | "REQUEST_REQUIRED_FIELD_ADDED"
  | "PATH_ADDED"
  | "RESPONSE_FIELD_ADDED"
  | "REQUEST_OPTIONAL_FIELD_ADDED"

export type Severity = "BREAKING" | "SAFE"

export interface DriftEventDto {
  id: string
  serviceId: string
  serviceName: string
  changeType: ChangeType
  severity: Severity
  httpMethod: string | null
  apiPath: string | null
  detail: string | null
  detectedAt: string
  acknowledged: boolean
}

export interface PageResponse<T> {
  content: T[]
  page: {
    size: number
    number: number
    totalElements: number
    totalPages: number
  }
}
