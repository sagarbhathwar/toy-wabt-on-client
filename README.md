2. 
  * Global variable
    x:int = 10
    The global variable is stored in the global environment(js memory) and accessed using "load" and "store" instructions
    compiler.ts > codeGen > case "define" and compiler.ts > codeGenExpr > case "id"
  * One function with parameter
    def f(x:int):
      print(x)
    The parameter is defined using the "param" keyword. Inside the function body, it is accessed using the "get_local $<param>" instruction
    compiler.ts > codeGenFunc
  * Variable defined inside the function
    def f():
      x:int = 10
      print(x)
    Variable definitions inside functions is declared using the "local $<varName>" instruction and accessed using "get_local $<varName>" instruction
    compiler.ts > codeGenFunc

3. Added a "print" inside the while loop. "Logged from WASM" indefinitely. Web page freezes, only solution is to forcefully close it

4. 