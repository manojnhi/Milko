/** msg = [english, hindi]; UI chuni hui language dikhata hai. */
export class ValidationError extends Error {
  constructor(en, hi, field) {
    super(en);
    this.name = 'ValidationError';
    this.msg = [en, hi || en];
    this.field = field;
  }
}
export const fail = (en, hi, field) => { throw new ValidationError(en, hi, field); };
