import { parser } from "lezer-python";
import { Tree, TreeCursor } from "lezer-tree";
import { Expr, FuncDef, Literal, Stmt, Op, UniOp, VarDef, Type } from "./ast";

export function traverseOp(op: string): Op {
  switch (op) {
    case "+":
      return Op.Plus;
    case "-":
      return Op.Minus;
    case "*":
      return Op.Mul;
    case "//":
      return Op.Div;
    case "%":
      return Op.Mod
    case "==":
      return Op.Eq
    case "!=":
      return Op.Ne;
    case "<=":
      return Op.Lte;
    case ">=":
      return Op.Gte;
    case "<":
      return Op.Lt;
    case ">":
      return Op.Gt;
    case "is":
      return Op.Is;
    default:
      new Error(`Unknown operation ${op}`);
  }
}

export function traverseUniOp(op: string): UniOp {
  switch(op) {
    case "-":
      return UniOp.Minus
    case "not":
      return UniOp.Not;
    default:
      throw Error(`Unknown opeartion ${op}`);
  }
}

export function traverseExpr(c: TreeCursor, s: string): Expr {
  console.log(c.type.name);
  switch (c.type.name) {
    case "Number":
    case "Boolean":
    case "None":
      const l = s.substring(c.from, c.to);
      const literal: Literal = traverseLiteral(l)
      return {
        tag: "literal",
        value: literal
      };
    case "VariableName":
      return {
        tag: "id",
        name: s.substring(c.from, c.to)
      }
    case "ParenthesizedExpression":
      c.firstChild() // Parenthesis
      c.nextSibling() // Expression
      const expr = traverseExpr(c, s);
      c.parent(); // Go back
      return {
        tag: "paren",
        expr
      }
    case "BinaryExpression":
      c.firstChild();
      const left = traverseExpr(c, s);
      c.nextSibling(); // Here we would look at this value to get the operator
      const op = s.substring(c.from, c.to);
      c.nextSibling();
      const right = traverseExpr(c, s);
      c.parent();
      return {
        tag: "op",
        op: traverseOp(op),
        left: left,
        right: right
      }
    case "UnaryExpression":
      c.firstChild();
      const unOp = s.substring(c.from, c.to);
      c.nextSibling();
      const arg = traverseExpr(c, s);
      c.parent();
      return {
        tag: "uniop",
        op: unOp == "-" ? UniOp.Minus : UniOp.Not,
        right: arg
      }

    default:
      throw new Error("Could not parse expr at " + c.from + " " + c.to + ": " + s.substring(c.from, c.to));
  }
}

export function traverseLiteral(s: string): Literal {
  switch(s) {
    case "True":
      return {tag: "True"}
    case "False":
      return {tag: "False"}
    case "None":
      return {tag: "None"}
    default:
      try {
        return {tag: "Number", value: parseInt(s)}
      } catch {
        throw Error(`Cannot parse literal ${s}`);
      }
  }
}

export function traveseType(s: string): Type {
  if (s == "int") {
    return Type.Int
  } else if(s == "bool") {
    return Type.Bool;
  } else {
    throw Error(`Unsupported type ${s}`);
  }
}

export function traverseProgramStmt(c: TreeCursor, s: string): Stmt | VarDef | FuncDef {
  console.log(c.node.type.name);
  switch(c.node.type.name){
    case "AssignStatement":
      c.firstChild(); // go to name
      const name = s.substring(c.from, c.to);
      c.nextSibling(); // go to equals or :
      if (s.substring(c.from, c.to)[0] == ":") { // VarDef
        c.firstChild()
        c.nextSibling();
        const type = s.substring(c.from, c.to);
        c.parent();
        c.nextSibling(); // Equals
        c.nextSibling(); // Literal
        const value = s.substring(c.from, c.to);
        const literal = traverseLiteral(value);
        c.parent();
        return {
          tag: "vardef",
          name,
          type: traveseType(type),
          literal
        }
      } else { // Stmt ("define")
        c.nextSibling(); // go to value
        const value = traverseExpr(c, s);
        c.parent();
        return {
          tag: "define",
          name: name,
          value: value
        }
      }
    
    case "ExpressionStatement":
      c.firstChild();
      let childName = c.node.type.name;
      if((childName as any) === "CallExpression") { // Note(Joe): hacking around typescript here; it doesn't know about state
        c.firstChild();
        const callName = s.substring(c.from, c.to);
        if (callName === "globals") {
          c.parent();
          c.parent();
          return {
            tag: "globals"
          };
        } else if (callName === "print") {
          c.nextSibling(); // go to arglist
          c.firstChild(); // go into arglist
          c.nextSibling(); // find single argument in arglist
          const arg = traverseExpr(c, s);
          c.parent(); // pop arglist
          c.parent(); // pop expressionstmt
          return {
            tag: "print",
            // LOL TODO: not this
            value: arg
          };
        }
      } else {
        const expr = traverseExpr(c, s);
        c.parent(); // pop going into stmt
        return {
          tag: "expr",
          expr: expr
        }
      }
    case "FunctionDefinition":
      return {
        tag: "func"
      }
    default:
      throw new Error("Could not parse stmt at " + c.node.from + " " + c.node.to + ": " + s.substring(c.from, c.to));
  }
}

export function traverse(c: TreeCursor, s: string): any {
  switch (c.node.type.name) {
    case "Script":
      const stmts = [];
      const firstChild = c.firstChild();
      do {
        stmts.push(traverseProgramStmt(c, s));
      } while (c.nextSibling())
      console.log(stmts);
      return stmts;
    default:
      throw new Error("Could not parse program at " + c.node.from + " " + c.node.to);
  }
}
export function parse(source: string): Array<Stmt> {
  const t = parser.parse(source);
  return traverse(t.cursor(), source);
}
