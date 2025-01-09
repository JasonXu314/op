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

		public 'operator/'(other: number): Vector {
			return new Vector(...this.elems.map((e) => e / other));
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
		expect(op<Vector>`${a} / ${2}`).toMatchObject(new Vector(0.5, 1, 1.5));
	});

	it('Can evaluate literals', () => {
		const a = new Vector(1, 2, 3);

		expect(op<Vector>`${a} * 2`).toMatchObject(new Vector(2, 4, 6));
		expect(op<Vector>`${a} * 12`).toMatchObject(new Vector(12, 24, 36));
		expect(op<Vector>`${a} / 2`).toMatchObject(new Vector(0.5, 1, 1.5));
		expect(op<string>`'fizz' + 'buzz'`).toBe('fizzbuzz');
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

