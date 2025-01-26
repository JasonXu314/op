import { makeOp, op, OpTag } from '../src/index';

describe('Core Behavior', () => {
	class Vector {
		public readonly elems: readonly number[];

		public constructor(...elems: number[]) {
			this.elems = elems;
		}

		public invert(): Vector {
			return new Vector(...this.elems.map((e) => -e));
		}

		public 'operator=='(other: Vector): boolean {
			return this.elems.length === other.elems.length && this.elems.every((e, i) => e === other.elems[i]);
		}

		public 'operator!='(other: Vector): boolean {
			return !this['operator=='](other);
		}

		public 'operator+'(other: Vector): Vector {
			if (other.elems.length !== this.elems.length) {
				throw new Error('Incompatible vectors for addition');
			} else {
				return new Vector(...this.elems.map((e, i) => e + other.elems[i]));
			}
		}

		public 'operator-'(other: Vector): Vector {
			return this['operator+'](other.invert());
		}

		public 'operator*'(other: number): Vector;
		public 'operator*'(other: Vector): number;
		public 'operator*'(other: Vector | number): Vector | number {
			if (typeof other === 'number') {
				return new Vector(...this.elems.map((e) => e * other));
			} else {
				if (other.elems.length === this.elems.length) {
					return this.elems.reduce((t, e, i) => t + e * other.elems[i], 0);
				} else {
					throw new Error('Incompatible vectors for dot product');
				}
			}
		}
	}

	it('Can evaluate default binary operations', () => {
		const a = new Vector(1, 2, 3),
			b = new Vector(1, 2, 3),
			c = new Vector(2, 3, 4);

		expect(op<boolean>`${a} == ${b}`).toBe(true);
		expect(op<boolean>`${a} != ${c}`).toBe(true);
		expect(op<Vector>`${a} + ${b}`).toMatchObject(new Vector(2, 4, 6));
		expect(op<Vector>`${a} - ${b}`).toMatchObject(new Vector(0, 0, 0));
		expect(op<Vector>`${a} * ${2}`).toMatchObject(new Vector(2, 4, 6));
		expect(op<number>`${a} * ${c}`).toBe(2 + 6 + 12);
	});

	it('Can evaluate literals', () => {
		const a = new Vector(1, 2, 3);

		expect(op<Vector>`${a} * 2`).toMatchObject(new Vector(2, 4, 6));
		expect(op<Vector>`${a} * 12`).toMatchObject(new Vector(12, 24, 36));
		expect(op<string>`'fizz' + 'buzz'`).toBe('fizzbuzz');
		expect(op<string>`'fizz' + 2`).toBe('fizz2');
		expect(op<string>`1 + 'buzz'`).toBe('1buzz');
		expect(op<string>`1 / 2`).toBe(0.5);
		expect(op<string>`1 - 2`).toBe(-1);
		expect(op<string>`1 * 2`).toBe(2);
	});

	it('Can evaluate chained operations', () => {
		const a = new Vector(1, 2, 3),
			b = new Vector(1, 2, 3),
			c = new Vector(2, 3, 4);

		expect(op<Vector>`${a} + ${b} + ${c}`).toMatchObject(new Vector(4, 7, 10));
		expect(op<number>`${a} * 2 * ${c}`).toBe(4 + 12 + 24);
		expect(op<number>`${a} * 2 * 4 * ${c}`).toBe(16 + 48 + 96);
	});

	it('Respects order of operations', () => {
		const a = new Vector(1, 2, 3),
			b = new Vector(4, 7, 10),
			c = new Vector(2, 3, 4);

		expect(op<Vector>`${a} * 2 + ${c}`).toMatchObject(new Vector(4, 7, 10));
		expect(op<boolean>`${a} * 2 + ${c} == ${b}`).toBe(true);
	});

	it('Respects grouping of operations', () => {
		const a = new Vector(1, 2, 3),
			b = new Vector(4, 7, 10),
			c = new Vector(2, 3, 4);

		expect(op<Vector>`${a} * (${b} + ${c})`).toBe(6 + 20 + 42);
	});

	it('Falls back to static methods', () => {
		class Vec extends Vector {
			public static 'operator/'(vec: Vec, other: number): Vec {
				return new Vec(...vec.elems.map((e) => e / other));
			}

			public static 'operator*'(other: number, vec: Vec): Vec {
				return vec['operator*'](other);
			}

			public static 'operator+'(other: Point, vec: Vec): Vec {
				return vec['operator+'](new Vec(other.a, other.b, 0));
			}
		}

		class Point {
			public constructor(public readonly a: number, public readonly b: number) {}

			public static 'operator*'(other: number, pt: Point): Point {
				return new Point(pt.a * other, pt.b * other);
			}

			public static 'operator+'(other: number, pt: Point): Point {
				if (!(pt instanceof Point)) throw new Error('Not point on RHS');
				if (typeof other !== 'number') throw new Error('Not number on LHS'); // tests operator disambiguation

				return new Point(pt.a + other, pt.b + other);
			}
		}

		const a = new Vec(1, 2, 3),
			b = new Point(3, 4);

		expect(op<Vec>`${a} / 2`).toMatchObject(new Vec(0.5, 1, 1.5));
		expect(op<Vec>`${b} + ${a}`).toMatchObject(new Vec(4, 6, 3));
		expect(op<Vec>`2 * ${a}`).toMatchObject(new Vec(2, 4, 6));
		expect(op<Vec>`2 * ${b}`).toMatchObject(new Point(6, 8));
		expect(op<Vec>`2 + ${b}`).toMatchObject(new Point(5, 6));
	});

	it('Gives (semi-) useful error messages', () => {
		class Point {
			public constructor(public readonly x: number, public readonly y: number) {}

			public [Symbol.toPrimitive](): string {
				return `(${this.x}, ${this.y})`;
			}
		}

		class Vec extends Vector {
			public toString(): string {
				return `<${this.elems.join(', ')}>`;
			}
		}

		const a = new Vector(1, 2, 3),
			b = new Point(4, 5),
			c = new Vec(6, 7, 8);

		expect(() => op<never>`${a} + '`).toThrow('Syntax error: string literal expected');
		expect(() => op<never>`${a} + 'asdf`).toThrow('Syntax error: unterminated string literal');
		expect(() => op<never>`${a} + @`).toThrow("Syntax error: invalid token '@'");
		expect(() => op<never>`(${a} * 2`).toThrow("Syntax error: unterminated '('");
		expect(() => op<never>`${a} * +`).toThrow('Syntax error: expected value');
		expect(() => op<never>`${a} *`).toThrow('Syntax error: expected value');
		expect(() => op<never>`${a} 2`).toThrow('Syntax error: expected operator');

		expect(() => op<never>`${a} / 2`).toThrow(
			"Operator error: operator/ is not a callable on left operand Vector or a static function on either operand's types"
		);
		expect(() => op<never>`2 + ${a}`).toThrow('Operator error: cannot evaluate 2 + Vector');
		expect(() => op<never>`2 + ${b}`).toThrow('Operator error: cannot evaluate 2 + (4, 5)');
		expect(() => op<never>`2 + ${c}`).toThrow('Operator error: cannot evaluate 2 + <6, 7, 8>');
		expect(() => op<never>`2 / ${a}`).toThrow('Operator error: cannot evaluate 2 / Vector');
		expect(() => op<never>`2 == ${a}`).toThrow('Operator error: operator== is not a builtin or a callable on left operand 2');
	});
});

describe('Custom operators', () => {
	let op: OpTag;

	it('Constructs properly with custom operator definitions', () => {
		op = makeOp([['@', '#'], ['!'], ['=']]);

		expect(op).toBeDefined();
	});

	class Foo {
		public constructor(public readonly a: number, public readonly b: number) {}

		public 'operator@'(other: Baz): Foo {
			return new Foo(other.b - this.b, other.a / this.a);
		}

		public 'operator#'(other: Foo): Baz {
			return new Baz(this.a * other.b, other.a + this.b);
		}

		public 'operator='(other: Foo | Baz): boolean {
			return this.a === other.a && this.b === other.b;
		}
	}

	class Baz {
		public constructor(public readonly a: number, public readonly b: number) {}

		public 'operator!'(other: Foo): Foo {
			return new Foo(this.a / other.b, this.b - other.a);
		}

		public 'operator='(other: Foo | Baz): boolean {
			return this.a === other.a && this.b === other.b;
		}
	}

	it('Handles custom precedence correctly', () => {
		const a = new Foo(3, 5),
			b = new Foo(2, 9);

		expect(op<Foo>`${a} # ${b} ! ${b}`).toMatchObject(a);
		expect(op<boolean>`${a} # ${b} ! ${b} = ${a}`).toBe(true);
	});
});

describe('Unary operators', () => {
	const op = makeOp([
		['*', '/'],
		['+', '-'],
		['==', '!='],
		[
			{ type: 'fn', parts: ['[', ']'] },
			{ type: 'fn', parts: ['(', ')'] },
			{ type: 'un', op: '-' },
			{ type: 'un', op: '~' }
		]
	]);

	class Vector {
		public readonly elems: number[];

		public constructor(...elems: number[]) {
			this.elems = elems;
		}

		public 'operator-'(): Vector;
		public 'operator-'(other: Vector): Vector;
		public 'operator-'(other?: Vector): Vector {
			if (other) {
				return new Vector(...this.elems.map((elem, i) => elem - other.elems[i]));
			} else {
				return new Vector(...this.elems.map((elem) => -elem));
			}
		}

		public 'operator~'(): Vector {
			return this['operator-']();
		}
	}

	it('Can evaluate unary operators', () => {
		const v = new Vector(1, 2, 3);

		expect(op`-${v}`).toMatchObject(new Vector(-1, -2, -3));
		expect(op`~${v}`).toMatchObject(new Vector(-1, -2, -3));
	});

	it('Can distinguish unary/binary ambiguity', () => {
		const a = new Vector(1, 2, 3),
			b = new Vector(2, 3, 4);

		expect(op`${a} -  -${b}`).toMatchObject(new Vector(3, 5, 7));
	});

	it('Gives (semi-)useful error messages', () => {
		expect(() => op`-${new Map()}`).toThrow('Operator error: operator- is not a callable on Map');
	});
});

describe('Function operators', () => {
	class Matrix {
		public readonly elems: number[][];

		public constructor(public readonly n: number, public readonly m: number) {
			this.elems = new Array(n).fill(null).map(() => new Array(m).fill(0));
		}

		public set(i: number, j: number, val: number): void {
			this.elems[i][j] = val;
		}

		public 'operator[]'(i: number, j: number): number {
			return this.elems[i][j];
		}

		public static 'operator()'(mat: Matrix): Matrix {
			const out = new Matrix(mat.n, mat.m);

			for (let j = 0; j < mat.m; j++) out.elems[0][j] = mat.elems[0][j] / mat.elems[0][0];
			for (let i = 1; i < mat.n; i++) {
				for (let j = i; j < mat.m; j++) out.elems[i][j] = mat.elems[i][j] - (out.elems[i - 1][j] * mat.elems[i][i - 1]) / mat.elems[i - 1][i - 1];
				const f = out.elems[i][i];
				for (let j = i; j < mat.m; j++) out.elems[i][j] /= f;
			}

			return out;
		}
	}

	it('Can evaluate function operators', () => {
		const mat = new Matrix(2, 3),
			mat2 = new Matrix(2, 3),
			ref = new Matrix(2, 3);

		for (let i = 0; i < 2; i++) {
			for (let j = 0; j < 3; j++) {
				mat.set(i, j, i + j);
				mat2.set(i, j, i + j + 1);
			}
		}

		(ref as any).elems = [
			[1, 2, 3],
			[0, 1, 2]
		];

		expect(op`${mat}[1, 2]`).toBe(3);
		expect(op`${mat2}()`).toMatchObject(ref);
	});

	it('Gives (semi-)useful error messages', () => {
		const mat = new Matrix(1, 1);

		expect(() => op`${mat}[1`).toThrow("Syntax error: expected ']'");
		expect(() => op`${mat}[1,`).toThrow('Syntax error: expected value');
		expect(() => op`${mat}[1 )]`).toThrow("Syntax error: expected either ',' or ']', got ')'");
		expect(() => op`${new Map()}()`).toThrow('Operator error: operator() is not a callable on left operand Map or a static function on its type');
	});
});

