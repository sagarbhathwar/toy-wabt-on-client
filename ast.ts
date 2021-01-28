export type ProgramStmt = 
{ tag: "vardef", value: VarDef }
| {tag: "stmt", value: Stmt}

export type VarDef = {
  tag: "vardef",
  name: string,
  type: Type,
  value: Literal
}

export type TypeDef = {
  name: string,
  type: Type
}

export type FuncDef = {
  tag: "func",
  name: string,
  params: Array<TypeDef>,
  varDefs?: Array<VarDef | Stmt>,
  retType?: Type,
  stmts: Array<VarDef | Stmt>
}

export type Stmt = 
    {tag: "define" ,name: string, value: Expr}
  | {tag: "return", expr: Expr}
  | {tag: "expr", expr: Expr}
  | {
      tag: "if",
      condition: Expr,
      ifStmts: Array<Stmt>,
      elifCondition?: Expr,
      elifStmts?: Array<Stmt>,
      elseStmts?: Array<Stmt>
    }
  | {tag: "while", condition: Expr, stmts: Array<Stmt>}
  | {tag: "print", value: Expr}
  | {tag: "globals"}

export type Expr = {
    tag: "op",
    op: Op,
    left: Expr,
    right: Expr
  }
  |
  {
    tag: "num",
    value: number
  }
  |
  {
    tag: "id",
    name: string
  }
  | {tag: "paren", expr: Expr}
  | {tag: "uniop", op: UniOp, right: Expr}
  | {tag: "literal", value: Literal}
  |
  {
    tag: "call",
    name: string,
    args: Array<Expr>,
    isStandalone: boolean
  };

export type Literal = 
  {tag: "None"} 
| {tag: "True"} 
| {tag: "False"} 
| {tag: "Number", value: number}

export type Number = {value: number}

export enum UniOp {Minus, Not};

export enum Op { Plus, Minus, Mul, Div, Mod, Eq, Ne, Lte, Gte, Lt, Gt, Is } ;

export enum Type {Int, Bool};
