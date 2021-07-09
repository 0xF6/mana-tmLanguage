import { should } from 'chai';
import { tokenize, Input, Token } from './utils/tokenize';
describe("Class", () => {
    before(() => { should(); });


    describe("Class", () => {
        it("class keyword and storage modifiers", async () => {

            const input = Input.InNamespace(`
public             class PublicClass { }`);

            const tokens = await tokenize(input);

            tokens.should.deep.equal([
                Token.Keywords.Modifiers.Public,
                Token.Keywords.Class,
                Token.Identifiers.ClassName("PublicClass"),
                Token.Punctuation.OpenBrace,
                Token.Punctuation.CloseBrace]);
        });
})});