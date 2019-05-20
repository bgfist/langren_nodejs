enum GameRole {
  Citizen,
  Wolf,
  Predictor,
  Wizard,
  Guard,
  Hunter
}

export enum GameStage {
  GameOver = -1,

  NightFall = 0,
  WolfActionEnd,
  WizardAction,

  DayBreak = 10,
  SpeakInTurn,
  Vote
}

interface Player {
  uid: number
  dead: boolean
  role: GameRole
}

interface Game {
  players: Player[]
  stage: GameStage
}