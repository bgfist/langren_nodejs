import { User } from './user'

export interface Room {
  rid: number
  name: string
  maxUserCount: number
  users: User[]
}