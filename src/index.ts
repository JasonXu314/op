import { ASTLiteral, ASTNode } from './ast.js';
import { isNumber, OP } from './utils.js';

export interface UnaryOpSpec {
	type: 'un';
	op: string;
}

export interface BinaryOpSpec {
	type: 'bin';
	op: string;
}

export interface FunctionOpSpec {
	type: 'fn';
	parts: [string, string];
}

export type OpSpec = BinaryOpSpec | FunctionOpSpec | UnaryOpSpec;

export type OpTag = <T>(strs: TemplateStringsArray, ...args: any[]) => T;
export type DefaultOpTag = OpTag & { make: (operators: (string | OpSpec)[][]) => OpTag };

interface LitTok<T> {
	type: 'lit';
	val: ASTLiteral<T>;
}

interface OpTok {
	type: 'op';
	[OP]: OpSpec;
	raw: string;
}

type Tok<T> = LitTok<T> | OpTok;

export function makeOp(operators: (string | OpSpec)[][]): OpTag {
	const ops = processOps(operators);

	return function op<T>(strs: TemplateStringsArray, ...vals: any[]): T {
		let strIdx: number = 0,
			charIdx: number = 0;

		function lex(): Tok<T> {
			if (strs[strIdx] === undefined) return { type: 'lit', val: undefined };

			while (strs[strIdx][charIdx] !== undefined && strs[strIdx][charIdx].trim() === '') charIdx++;

			if (strs[strIdx][charIdx] === undefined) {
				return {
					type: 'lit',
					val: vals[strIdx]
				};
			} else {
				let op: OpSpec | null = null,
					raw: string = '';

				for (const o of ops.flat()) {
					if (o.type === 'fn') {
						if (strs[strIdx].startsWith(o.parts[0], charIdx)) {
							op = o;
							raw = o.parts[0];
							break;
						} else if (strs[strIdx].startsWith(o.parts[1], charIdx)) {
							op = o;
							raw = o.parts[1];
							break;
						}
					} else {
						if (strs[strIdx].startsWith(o.op, charIdx)) {
							op = o;
							raw = o.op;
							break;
						}
					}
				}

				if (op !== null) {
					return { type: 'op', [OP]: op, raw };
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
					return { type: 'lit', val: str };
				} else if (isNumber(strs[strIdx][charIdx])) {
					const ci = charIdx;

					let str = '';
					while (strs[strIdx][charIdx] !== undefined && strs[strIdx][charIdx].trim() !== '' && isNumber(strs[strIdx][charIdx])) {
						str += strs[strIdx][charIdx];

						charIdx++;
					}

					charIdx = ci;
					return { type: 'lit', val: Number(str) };
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
						charIdx += consumedTok.raw.length;
					} else {
						charIdx += typeof consumedTok.val === 'string' ? consumedTok.val.length + 2 : consumedTok.val.toString().length;
					}
				}
			}
		}

		const parsers: (() => ASTLiteral<T> | ASTNode<T>)[] = [
			() => {
				const tok = lex();

				if (tok.type === 'op') {
					if (tok.raw === '(') {
						next();
						const expr = parsers.at(-1)();

						const cp = lex();
						if (cp.type === 'op' && cp.raw === ')') {
							next();
							return expr;
						} else {
							// throw new Error(`Syntax error: missing ')' before ${strs[strIdx].slice(charIdx)}${vals[strIdx]}, got ${cp[OP]}`);
							// should be end of input because top level parse will consume everything until ')'
							throw new Error("Syntax error: unterminated '('");
						}
					} else if (tok[OP].type === 'un' || ops.flat().some((op) => op.type === 'un' && op.op === tok.raw)) {
						next();
						const expr = parsers.at(-1)();

						return {
							[OP]: tok[OP].type === 'un' ? tok[OP] : ops.flat().find((op) => op.type === 'un' && op.op === tok.raw)!,
							left: null,
							right: expr
						};
					} else {
						throw new Error('Syntax error: expected value');
					}
				} else {
					next();

					if (tok.val !== undefined) {
						const val = tok.val;
						let nextTok = lex();

						if (nextTok.type === 'op' && nextTok[OP].type === 'fn' && nextTok.raw === nextTok[OP].parts[0]) {
							next();

							const closing = nextTok[OP].parts[1],
								args = [];
							nextTok = lex();

							while (nextTok.type !== 'op' || nextTok.raw !== closing) {
								args.push(parsers.at(-1)());
								nextTok = lex();

								if (nextTok.type === 'op') {
									if (nextTok.raw === ',') {
										next();
										nextTok = lex();
									} else if (nextTok.raw !== closing && nextTok[OP].type !== 'un' && nextTok.raw !== '(') {
										throw new Error(`Syntax error: expected either ',' or '${closing}', got '${nextTok.raw}'`);
									} else if (nextTok.raw === closing) {
										break;
									}
								} else {
									// encountering literal (without already having error) necessarily means literal is undefined
									throw new Error(`Syntax error: expected '${closing}'`);
								}
							}

							return { [OP]: nextTok[OP], left: val, right: args };
						} else {
							return val;
						}
					} else {
						throw new Error('Syntax error: expected value');
					}
				}
			}
		].concat(
			ops.map<() => ASTLiteral<T> | ASTNode<T>>((tier, i) => () => {
				const left = parsers[i]();

				let tok = lex();

				if (tok.type === 'lit' && tok.val === undefined) {
					next();
					return left;
				}

				if (tok.type === 'lit') throw new Error('Syntax error: expected operator');

				const clauses: (ASTLiteral<T> | ASTNode<T> | OpSpec)[] = [left];
				while (tok.type === 'op' && tier.some((op) => op.type === 'bin' && op.op === (tok as OpTok).raw)) {
					next();
					clauses.push(tok[OP]);
					clauses.push(parsers[i]());

					tok = lex();
				}

				while (clauses.length > 1) {
					const left = clauses.shift() as ASTLiteral<T> | ASTNode<T>,
						op = clauses.shift() as OpSpec,
						right = clauses.shift() as ASTLiteral<T> | ASTNode<T>;

					clauses.unshift({
						[OP]: op,
						left,
						right
					});
				}

				return clauses[0] as ASTNode<T>;
			})
		);

		const tree = parsers.at(-1)();

		return evalOps(tree) as T;
	};
}

function processOps(ops: (string | OpSpec)[][]): OpSpec[][] {
	if (ops.length === 0 || !ops.some((tier) => tier.length !== 0)) throw new Error('No operators supplied');

	const out = ops.map((ops) => ops.map((op) => (typeof op === 'string' ? ({ type: 'bin', op } as const) : op)));

	const all = out.flat();

	if (!all.some((op) => (op.type === 'fn' ? op.parts.includes('(') : op.op === '('))) out.at(-1).push({ type: 'un', op: '(' });
	if (!all.some((op) => (op.type === 'fn' ? op.parts.includes(')') : op.op === ')'))) out.at(-1).push({ type: 'un', op: ')' });
	if (!all.some((op) => (op.type === 'fn' ? op.parts.includes(',') : op.op === ','))) out.at(-1).push({ type: 'un', op: ',' });

	return out;
}

function opName(op: OpSpec): string {
	if (op.type === 'fn') {
		return op.parts.join('');
	} else {
		return op.op;
	}
}

function evalOps<T>(node: ASTNode<T> | ASTLiteral<T>): ASTLiteral<T> {
	if (typeof node === 'object' && OP in node) {
		if (node[OP].type === 'bin') {
			const left = evalOps(node.left),
				right = evalOps(node.right),
				op = 'operator' + opName(node[OP]);

			if (typeof left === 'object') {
				if (op in left) {
					return left[op](right);
				} else {
					if (op in left.constructor) {
						const Class = left.constructor;

						try {
							return Class[op](left, right);
						} catch (e) {}
					}

					if (typeof right === 'object' && op in right.constructor) {
						const Class = right.constructor;

						try {
							return Class[op](left, right);
						} catch (e) {}
					}

					throw new Error(
						`Operator error: ${op} is not a callable on left operand ${toErrorDisplay(left)} or a static function on either operand's types`
					);
				}
			} else if (node[OP].op === '+') {
				if ((typeof left === 'string' || typeof left === 'number') && (typeof right === 'string' || typeof right === 'number')) {
					// need as any because typescript disallows (string | number) + (string | number) even though it's perfectly fine in JS
					return (left as any) + right;
				} else {
					if (typeof right === 'object' && op in right) {
						try {
							return right[op](left);
						} catch (e) {}
					}

					if (typeof right === 'object' && op in right.constructor) {
						const Class = right.constructor;

						try {
							return Class[op](left, right);
						} catch (e) {}
					}

					throw new Error(`Operator error: cannot evaluate ${toErrorDisplay(left)} + ${toErrorDisplay(right)}`);
				}
			} else if (['-', '*', '/'].includes(node[OP].op)) {
				if (typeof left === 'number' && typeof right === 'number') {
					switch (node[OP].op) {
						case '-':
							return left - right;
						case '*':
							return left * right;
						case '/':
							return left / right;
					}
				} else {
					if (typeof right === 'object' && op in right) {
						try {
							return right[op](left);
						} catch (e) {}
					}

					if (typeof right === 'object' && op in right.constructor) {
						const Class = right.constructor;

						try {
							return Class[op](left, right);
						} catch (e) {}
					}

					throw new Error(`Operator error: cannot evaluate ${toErrorDisplay(left)} ${node[OP].op} ${toErrorDisplay(right)}`);
				}
			} else {
				throw new Error(`Operator error: ${op} is not a builtin or a callable on left operand ${toErrorDisplay(left)}`);
			}
		} else if (node[OP].type === 'un') {
			const right = evalOps(node.right),
				op = 'operator' + opName(node[OP]);

			if (typeof right === 'object' && op in right) {
				return right[op]();
			} else {
				throw new Error(`Operator error: ${op} is not a callable on ${toErrorDisplay(right)}`);
			}
		} else {
			const left = evalOps(node.left),
				args = (node.right as (ASTLiteral<T> | ASTNode<T>)[]).map((val) => evalOps(val)),
				op = 'operator' + opName(node[OP]);

			if (typeof left === 'object' && op in left) {
				return left[op](...args);
			} else {
				if (op in left.constructor) {
					const Class = left.constructor;

					try {
						return Class[op](left, args);
					} catch (e) {}
				}

				throw new Error(`Operator error: ${op} is not a callable on left operand ${toErrorDisplay(left)} or a static function on its type`);
			}
		}
	} else {
		return node;
	}
}

function toErrorDisplay(obj: any): string {
	if (typeof obj === 'object') {
		if (Symbol.toPrimitive in obj) {
			return `${obj}`;
		} else if ('toString' in obj && obj.toString !== Object.prototype.toString) {
			return obj.toString();
		} else {
			return obj.constructor.name;
		}
	} else {
		return `${obj}`;
	}
}

export const op: DefaultOpTag = makeOp([
	['*', '/'],
	['+', '-'],
	['==', '!='],
	[
		{ type: 'fn', parts: ['[', ']'] },
		{ type: 'fn', parts: ['(', ')'] },
		{ type: 'un', op: '-' }
	]
]) as any;

(op as any).make = makeOp;

