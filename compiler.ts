import { stringInput } from "lezer-tree";
import { Stmt, Expr, Literal, Op, UniOp, VarDef, FuncDef } from "./ast";
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
  newEnv: GlobalEnv,
  varDefs: string,
  fnDef: string
};

export function compile(source: string, env: GlobalEnv) : CompileResult {
  const ast = parse(source);
  const withDefines = augmentEnv(env, ast);
  const fn = [].concat.apply([], ast.filter(stmt => stmt.tag as any === "func")
                .map(stmt => codeGen(stmt, withDefines))).join("\n");
  let varDefs = [].concat.apply([], ast.filter(stmt => stmt.tag as any == "vardef")
                .map(stmt => `(local $${(stmt as any).name} i32)`));
  varDefs = varDefs.concat(ast.filter(stmt => stmt.tag as any == "vardef")
  .map(stmt => `${getValue((stmt as any).value)} (set_local $${(stmt as any).name})`))
  .join("\n");      
  const commandGroups = ast.filter(stmt => stmt.tag as any !== "func" && stmt.tag as any !== "vardef")
                           .map((stmt) => codeGen(stmt, withDefines));
  const commands = [].concat.apply([], commandGroups);
  return {
    fnDef: fn,
    wasmSource: commands.join("\n"),
    newEnv: withDefines,
    varDefs
  };
}

function envLookup(env : GlobalEnv, name : string) : number {
  if(!env.globals.has(name)) { console.log("Could not find " + name + " in ", env); throw new Error("Could not find name " + name); }
  return (env.globals.get(name) * 4); // 4-byte values
}

function codeGenFunc(fn: FuncDef, env: GlobalEnv) : Array<string> {
  let paramList = "";
  if(fn.params.length != 0) {
    paramList = fn.params.reduce((acc, curr) => `${acc} (param $${curr.name} i32)`, "");
  } 
  paramList = `${paramList} (result i32)`;
  
  // Parse only vardefs
  let fnBody = "";
  fn.varDefs.forEach(v => {
    fnBody = `${fnBody}\n(local $${(v as any).name} i32)`
  })
  fn.varDefs.forEach(v => {
    fnBody = `${fnBody}
    (i32.const ${(v as any).value.value})
    (set_local $${(v as any).name})`
  })

  
  paramList = paramList.trim();
  fnBody += fn.stmts.slice(0, -1)
                .map((s) => codeGen(s, env))
                .flat()
                .reduce((acc, curr) => `${acc}\n\t\t${curr}`, "");
  const retExpr = codeGenExpr((fn.stmts[fn.stmts.length - 1] as any).expr, env)
  fnBody += retExpr.join("\n");
  return [`(func $${fn.name} ${paramList}${fnBody})`]
}

function codeGenIf(stmt: any, env: GlobalEnv) : Array<string> {
  const {ifStmts, condition, elifStmts, elifCondition, elseStmts} = stmt;
  let code = `(if(result)(i32.eq ${codeGenExpr(condition, env).join("\n")} (i32.const 1))
                (then ${ifStmts.map((s: any) => codeGen(s, env).join("\n")).join("\n")})`
  if(elifCondition || elseStmts.length > 0) {
    code += "(else"
    if(elifCondition) {
      code += `(if (result)(i32.eq ${codeGenExpr(elifCondition, env).join("\n")} (i32.const 1))
                  (then ${elifStmts.map((s: any) => codeGen(s, env).join("\n")).join("\n")})
              `;
    }
    if(elseStmts.length > 0 && !elifCondition) {
      // Just else
      code += ` ${elseStmts.map((s: any) => codeGen(s, env).join("\n")).join("\n")}`
    } else if(elseStmts && elifCondition) {
      code += `(else ${elseStmts.map((s: any) => codeGen(s, env).join("\n")).join("\n")})`
    }
    code += ")"
    if(elifCondition) {
      code += ")"
    }
  }

  code += ")"

  console.log(code);
  return [code];
}

function codeGen(stmt: any, env: GlobalEnv) : Array<string> {
  switch(stmt.tag) {
    case "func":
      // Generate code for function
      return codeGenFunc(stmt, env);
    case "define":
      if(env.globals.get(stmt.name)) {
        const locationToStore = [`(i32.const ${envLookup(env, stmt.name)}) ;; ${stmt.name}`];
        var valStmts = codeGenExpr(stmt.value, env);
        return locationToStore.concat(valStmts).concat([`(i32.store)`]);
      } else {
        let valStmts = codeGenExpr(stmt.value, env);
        return valStmts.concat([`(local.set $${stmt.name})`]);
      }
    case "if":
      return codeGenIf(stmt, env);
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
    case "vardef":
      // TODO: 1) Store type 2) Check for existence
      const init = [`(local $${stmt.name} i32)`];
      const exprCode = codeGenExpr({tag: "literal", value: stmt.value}, env);
      const set = [`(set_local $${stmt.name})`];
      return init.concat(exprCode).concat(set);
    default:
      return []; 
  }
}

function getValue(l: Literal) {
  switch(l.tag) {
    case "Number":
      return "(i32.const " + l.value + ")";
    case "True":
      return "(i32.const 1)"; // Just for now!  
    case "False":
      return "(i32.const 0)"; // Just for now!
    case "None":
      return "(i32.const 2)"; // Just for now!
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
    case "call":
      const argStmts = expr.args
      .map((arg: Expr) => codeGenExpr(arg, env).join("\n"))
      .concat([`call $${expr.name}`])
      .join("\n");
      return [argStmts];
    case "paren":
      return codeGenExpr(expr.expr, env);
    case "id":
      if(env.globals.get(expr.name)) {
        return [`(i32.const ${envLookup(env, expr.name)})`, `i32.load `]
      } else {
        return [`(get_local $${expr.name})`]
      }
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