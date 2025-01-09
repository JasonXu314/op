export const OP = Symbol.for('op');

export function isNumber(str: string) {
	return !Number.isNaN(Number(str));
}

