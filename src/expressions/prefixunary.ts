import * as binaryen from "../binaryen";
import Compiler from "../compiler";
import * as reflection from "../reflection";
import * as typescript from "../typescript";

export function compilePrefixUnary(compiler: Compiler, node: typescript.PrefixUnaryExpression, contextualType: reflection.Type): binaryen.Expression {
  const op = compiler.module;

  const operand = compiler.compileExpression(node.operand, contextualType);
  const operandType = typescript.getReflectedType(node.operand);

  switch (node.operator) {

    case typescript.SyntaxKind.ExclamationToken:
    {
      typescript.setReflectedType(node, reflection.boolType);

      if (operandType === reflection.floatType)
        return op.f32.eq(operand, op.f32.const(0));

      else if (operandType === reflection.doubleType)
        return op.f64.eq(operand, op.f64.const(0));

      else if (operandType.isLong)
        return op.i64.eqz(operand);

      else
        return op.i32.eqz(operand);
    }

    case typescript.SyntaxKind.PlusToken: // noop
    {
      typescript.setReflectedType(node, operandType);
      return operand;
    }

    case typescript.SyntaxKind.MinusToken:
    {
      typescript.setReflectedType(node, operandType);

      if (operandType === reflection.floatType)
        return op.f32.neg(node.operand);

      else if (operandType === reflection.doubleType)
        return op.f64.neg(node.operand);

      else if (operandType.isLong)
        return op.i64.sub(op.i64.const(0, 0), operand);

      else // FIXME: negated constant literals result in sub(const.0, const.value)
        return compiler.maybeConvertValue(node, op.i32.sub(op.i32.const(0), operand), reflection.intType, operandType, true);
    }

    case typescript.SyntaxKind.TildeToken:
    {
      if (operandType.isLong) {

        typescript.setReflectedType(node, operandType);
        return op.i64.xor(operand, op.i64.const(-1, -1));

      } else if (operandType.isInt) {

        typescript.setReflectedType(node, operandType);
        return op.i32.xor(operand, op.i32.const(-1));

      } else if (contextualType.isLong) { // TODO: is the following correct / doesn't generate useless ops?

        typescript.setReflectedType(node, contextualType);
        return op.i64.xor(compiler.maybeConvertValue(node.operand, operand, operandType, contextualType, true), op.i64.const(-1, -1));

      } else {

        typescript.setReflectedType(node, reflection.intType);
        return op.i32.xor(compiler.maybeConvertValue(node.operand, operand, operandType, reflection.intType, true), op.i32.const(-1));

      }
    }

    case typescript.SyntaxKind.PlusPlusToken:
    case typescript.SyntaxKind.MinusMinusToken:
    {
      if (node.operand.kind === typescript.SyntaxKind.Identifier) {

        const local = compiler.currentLocals[(<typescript.Identifier>node.operand).text];
        if (local) {

          const cat = binaryen.categoryOf(local.type, op, compiler.uintptrSize);
          const isIncrement = node.operator === typescript.SyntaxKind.PlusPlusToken;

          const calculate = (isIncrement ? cat.add : cat.sub).call(cat,
            op.getLocal(
              local.index,
              binaryen.typeOf(compiler.uintptrType, compiler.uintptrSize)
            ),
            binaryen.valueOf(local.type, compiler.module, 1)
          );

          if (contextualType === reflection.voidType) {
            typescript.setReflectedType(node, reflection.voidType);
            return op.setLocal(local.index, calculate);
          } else {
            typescript.setReflectedType(node, local.type);
            return compiler.maybeConvertValue(node, op.teeLocal(local.index, calculate), reflection.intType, local.type, true);
          }
        }
      }
    }
  }

  compiler.error(node, "Unsupported unary prefix operator", typescript.SyntaxKind[node.operator]);
  return op.unreachable();
}
