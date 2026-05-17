# Third-Party Licenses

The bundled name database (`data/name_database.tagged.json`) is a
derivative work of the open corpora listed below. Each name in the
database was sourced from one of these; an LLM (Grok 4) added the
synthetic tags (role, intelligence, allure, themes, etc.) at build
time. Attribution is preserved here so it travels with the extension,
in line with the underlying licenses.

## Source corpora

### philipperemy/name-dataset
- **URL**: https://github.com/philipperemy/name-dataset
- **License**: Apache License 2.0 — see https://www.apache.org/licenses/LICENSE-2.0
- **Used for**: real-world first + last names, 106 countries, gender-tagged.

### sigpwned/popular-names-by-country-dataset
- **URL**: https://github.com/sigpwned/popular-names-by-country-dataset
- **License**: CC0 1.0 Universal (public domain) — see https://creativecommons.org/publicdomain/zero/1.0/
- **Used for**: top surnames per country, 75 countries.

### hackerb9/ssa-baby-names
- **URL**: https://github.com/hackerb9/ssa-baby-names
- **License**: LGPL-2.1 — see https://www.gnu.org/licenses/old-licenses/lgpl-2.1.html
- **Used for**: US SSA baby-name data 1880–present, used to slice era-tagged buckets (Victorian, 1920s, midcentury).

### mlane/cyberpunk-name-generator
- **URL**: https://github.com/mlane/cyberpunk-name-generator
- **License**: MIT — Copyright © 2025 Marcus Lane. See the MIT notice at the bottom of this file.
- **Used for**: cyberpunk handles with affiliation / class metadata.

### kraihn/dragon-names
- **URL**: https://github.com/kraihn/dragon-names
- **License**: MIT — Copyright © 2015 Jared Dickson. See the MIT notice at the bottom of this file.
- **Used for**: dragon names grouped by source (game / film / literature / etc.).

### repushko/mythology_names_dataset
- **URL**: https://github.com/repushko/mythology_names_dataset
- **License**: CC0 1.0 Universal (public domain) — see https://creativecommons.org/publicdomain/zero/1.0/
- **Used for**: 4096 names by pantheon (Greek / Norse / Egyptian / Hindu / Slavic / etc.).

### ironarachne/namegen
- **URL**: https://github.com/ironarachne/namegen
- **License**: Apache-2.0 — see https://www.apache.org/licenses/LICENSE-2.0
- **Used for**: 38 cultures + dwarf / elf / fantasy first + last names, baked into Go source as `[]string{}` arrays.

### dariusk/corpora
- **URL**: https://github.com/dariusk/corpora
- **License**: CC0 1.0 Universal (public domain) — see https://creativecommons.org/publicdomain/zero/1.0/
- **Used for**: public-domain humans (firstNames, neutralNames, country-specific name lists) + mythology entries (greek_gods, greek_titans, greek_monsters, norse_gods, egyptian_gods, roman_deities, hebrew_god, lovecraft).

## MIT License notice (applies to all MIT-licensed corpora above)

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
