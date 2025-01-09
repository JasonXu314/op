import { ASTLiteral, ASTNode } from './ast.js';
import { isNumber, OP } from './utils.js';

export type OpTag = <T>(strs: TemplateStringsArray, ...args: any[]) => T;
export type DefaultOpTag = OpTag & { make: (ops: string[][]) => OpTag };

export function makeOp(ops: string[][]): OpTag {
	return function op<T>(strs: TemplateStringsArray, ...vals: any[]): T {
		let strIdx: number = 0,
			charIdx: number = 0;

		function lex(): ASTLiteral<T> | { [OP]: string } {
			if (strs[strIdx] === undefined) return undefined;

			while (strs[strIdx][charIdx] !== undefined && strs[strIdx][charIdx].trim() === '') charIdx++;

			if (strs[strIdx][charIdx] === undefined) {
				return vals[strIdx];
			} else {
				const op = ops
					.flat()
					.concat('(', ')')
					.find((op) => strs[strIdx].startsWith(op, charIdx));

				if (op !== undefined) {
					return { [OP]: op };
				} else if (strs[strIdx][charIdx] === "'" || strs[strIdx][charIdx] === '"') {
					const ci = charIdx,
						quote = strs[strIdx][charIdx];
					charIdx++;

					if (strs[strIdx][charIdx] === undefined) throw new Error('Syntax error: string literal expected');

					let str = '';
					while (strs[strIdx][charIdx] !== quote) {
						str += strs[strIdx][charIdx];

						charIdx++;
						if (strs[strIdx][charIdx] === undefined) throw new Error('Syntax error: unterminated string literal');
					}

					charIdx = ci;
					return str;
				} else if (isNumber(strs[strIdx][charIdx])) {
					const ci = charIdx;

					let str = '';
					while (strs[strIdx][charIdx] !== undefined && strs[strIdx][charIdx].trim() !== '' && isNumber(strs[strIdx][charIdx])) {
						str += strs[strIdx][charIdx];

						charIdx++;
					}

					charIdx = ci;
					return Number(str);
				} else {
					throw new Error(`Syntax error: invalid token '${strs[strIdx][charIdx]}'`);
				}
			}
		}

		function next(): void {
			if (strs[strIdx] !== undefined) {
				if (strs[strIdx][charIdx] === undefined) {
					strIdx++;
					charIdx = 0;
				} else {
					const consumedTok = lex();

					if (typeof consumedTok === 'object' && OP in consumedTok) {
						charIdx += consumedTok[OP].length;
					} else {
						charIdx += typeof consumedTok === 'string' ? consumedTok.length + 2 : consumedTok.toString().length;
					}
				}
			}
		}

		const parsers = [
			() => {
				const tok = lex();

				if (typeof tok === 'object' && OP in tok) {
					if (tok[OP] === '(') {
						next();
						const expr = parsers.at(-1)();

						const cp = lex();
						if (typeof cp === 'object' && cp[OP] === ')') {
							next();
							return expr;
						} else {
							// throw new Error(`Syntax error: missing ')' before ${strs[strIdx].slice(charIdx)}${vals[strIdx]}, got ${cp[OP]}`);
							// should be end of input because top level parse will consume everything until ')'
							throw new Error("Syntax error: unterminated '('");
						}
					} else {
						throw new Error('Syntax error: expected value');
					}
				} else {
					next();

					if (tok !== undefined) {
						return tok;
					} else {
						throw new Error('Syntax error: expected value');
					}
				}
			}
		].concat(
			ops.map((tier, i) => () => {
				const left = parsers[i]();

				let tok = lex();

				if (tok === undefined) {
					next();
					return left;
				}

				if (typeof tok !== 'object' || !(OP in tok)) throw new Error('Syntax error: expected operator');

				const clauses = [left];
				while (tok !== undefined && tier.includes(tok[OP])) {
					next();
					clauses.push(tok[OP]);
					clauses.push(parsers[i]());

					tok = lex();
				}

				while (clauses.length > 1) {
					const left = clauses.shift(),
						op = clauses.shift(),
						right = clauses.shift();

					clauses.unshift({
						[OP]: op,
						left,
						right
					});
				}

				return clauses[0];
			})
		);

		const tree = parsers.at(-1)();

		return evalOps(tree);
	};
}

function evalOps<T>(node: ASTNode<T> | ASTLiteral<T>): ASTLiteral<T> {
	if (typeof node === 'object' && OP in node) {
		const left = evalOps(node.left),
			right = evalOps(node.right),
			op = 'operator' + node[OP];

		if (typeof left === 'object') {
			if (op in left) {
				return left[op](right);
			} else {
				throw new Error(`Operator error: ${op} is not a callable on left operand ${left}`);
			}
		} else if (node[OP] === '+') {
			if ((typeof left === 'string' || typeof left === 'number') && (typeof right === 'string' || typeof right === 'number')) {
				// need as any because typescript disallows (string | number) + (string | number) even though it's perfectly fine in JS
				return (left as any) + right;
			} else {
				throw new Error(`Operator error: cannot evaluate '${typeof left}' + '${typeof right}'`);
			}
		} else if (['-', '*', '/'].includes(node[OP])) {
			if (typeof left === 'number' && typeof right === 'number') {
				switch (node[OP]) {
					case '-':
						return left - right;
					case '*':
						return left * right;
					case '/':
						return left / right;
				}
			} else {
				throw new Error(`Operator error: cannot evaluate '${typeof left}' ${node[OP]} '${typeof right}'`);
			}
		} else {
			throw new Error(`Operator error: ${op} is not a builtin or a callable on left operand ${left}`);
		}
	} else {
		return node;
	}
}

export const op: DefaultOpTag = makeOp([
	['*', '/'],
	['+', '-'],
	['==', '!=']
]) as any;

(op as any).make = makeOp;

