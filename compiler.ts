import { stringInput } from "lezer-tree";
import { Stmt, Expr, Op, UniOp, VarDef } from "./ast";
import { parse } from "./parser";

// https://learnxinyminutes.com/docs/wasm/

// Numbers are offsets into global memory
export type GlobalEnv = {
  globals: Map<string, number>;
  offset: number;
}

export const emptyEnv = { globals: new Map(), offset: 0 };

export function augmentEnv(env: GlobalEnv, stmts: Array<Stmt | VarDef>) : GlobalEnv {
  const newEnv = new Map(env.globals);
  var newOffset = env.offset;
  stmts.forEach((s) => {
    switch(s.tag) {
      case "define":
      case "vardef":
        newEnv.set(s.name, newOffset);
        newOffset += 1;
        break;
    }
  })
  return {
    globals: newEnv,
    offset: newOffset
  }
}

type CompileResult = {
  wasmSource: string,
  newEnv: GlobalEnv
};

export function compile(source: string, env: GlobalEnv) : CompileResult {
  const ast = parse(source);
  const withDefines = augmentEnv(env, ast);
  const commandGroups = ast.map((stmt) => codeGen(stmt, withDefines));
  const commands = [].concat.apply([], commandGroups);
  return {
    wasmSource: commands.join("\n"),
    newEnv: withDefines
  };
}

function envLookup(env : GlobalEnv, name : string) : number {
  if(!env.globals.has(name)) { console.log("Could not find " + name + " in ", env); throw new Error("Could not find name " + name); }
  console.log(env.globals.get(name) * 4);
  return (env.globals.get(name) * 4); // 4-byte values
}

function codeGen(stmt: Stmt, env: GlobalEnv) : Array<string> {
  switch(stmt.tag) {
    case "define":
      const locationToStore = [`(i32.const ${envLookup(env, stmt.name)}) ;; ${stmt.name}`];
      var valStmts = codeGenExpr(stmt.value, env);
      return locationToStore.concat(valStmts).concat([`(i32.store)`]);
    case "print":
      var valStmts = codeGenExpr(stmt.value, env);
      return valStmts.concat([
        "(call $print)"
      ]);      
    case "expr":
      return codeGenExpr(stmt.expr, env);
    case "globals":
      var globalStmts : Array<string> = [];
      env.globals.forEach((pos, name) => {
        globalStmts.push(
          `(i32.const ${pos})`,
          `(i32.const ${envLookup(env, name)})`,
          `(i32.load)`,
          `(call $printglobal)`
        );
      });
      return globalStmts;  
  }
}

function codeGenExpr(expr : Expr, env: GlobalEnv) : Array<string> {
  switch(expr.tag) {
    case "literal": {
      switch(expr.value.tag) {
        case "Number":
          return ["(i32.const " + expr.value.value + ")"];
        case "True":
          return ["(i32.const 1)"]; // Just for now!  
        case "False":
          return ["(i32.const 0)"]; // Just for now!
        case "None":
          return ["(i32.const 2)"]; // Just for now!
      }
    }
    case "paren":
      return codeGenExpr(expr.expr, env);
    case "id":
      return [`(i32.const ${envLookup(env, expr.name)})`, `i32.load `]
    case "op":
      return codeGenOp(expr.op, expr.left, expr.right, env);
    case "uniop":
      return codeGenUniOp(expr.op, expr.right, env);
  }
}

function codeGenUniOp(op: UniOp, right: Expr, env: GlobalEnv): Array<string> {
  let rightStmts = codeGenExpr(right, env);
  if (op == UniOp.Minus) {
    return [`i32.const 0`]
    .concat(rightStmts)
    .concat([`i32.sub`]);
  } else if (op == UniOp.Not) {
    return [`i32.const 1`]
    .concat(rightStmts) // Assuming boolean is stored as an i32
    .concat(`i32.sub`)
  }
}

function codeGenOp(op: Op, left: Expr, right: Expr, env: GlobalEnv): Array<string> {
  var leftStmts = codeGenExpr(left, env);
  var rightStmts = codeGenExpr(right, env);

  let opr = codeGenInstr(op);

  return leftStmts.concat(rightStmts.concat([
    `(i32.${opr} )`
  ]));
}

function codeGenInstr(op: Op) {
  switch(op) {
    case Op.Plus:
      return "add";
    case Op.Minus:
      return "sub";
    case Op.Mul:
      return "mul";
    case Op.Div:
      return "div_s"
    case Op.Mod:
      return "rem_s"
    case Op.Eq:
      return "eq";
    case Op.Ne:
      return "ne";
    case Op.Gte:
      return "ge_s";
    case Op.Lte:
      return "le_s";
    case Op.Lt:
      return "lt_s";
    case Op.Gt:
      return "gt_s";
    default: 
      throw Error(`Support for operation not yet implemented`);
  }
}