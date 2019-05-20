import { GameStage } from '../models/game'

export interface Request<T extends RequestType> {
  uid: number
  rid: number
  type: T
  params: RequestTypeParamsMapper[T]
}

export enum RequestType {
  CreateRoom
}

interface RequestTypeParamsMapper {
  [RequestType.CreateRoom]: undefined
}

// -------------------------------------------

export interface Response {
  code: 200 | 500
  data?: any
  err?: string
}


// -------------------------------------------

export interface Push<T extends PushCommand> {
  cmd: T
  params: PushCommandParamsMapper[T]
}


export enum PushCommand {
  NewStage,
  WolfKill,

}

interface PushCommandParamsMapper {
  [PushCommand.NewStage]: ParamsNewStage
  [PushCommand.WolfKill]: undefined
}

interface ParamsNewStage {
  stage: GameStage
}

