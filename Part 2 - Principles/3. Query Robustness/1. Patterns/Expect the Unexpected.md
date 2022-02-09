**Rule 1: Expect the unexpected**
Nulls are a special data type in SQL that represent missing or unknown values. A null value is different from a blank value, a zero value or an empty string. 

You can concatenation an empty string with a non-empty string you get back the non-empty string. But if you try to concatenate a null string with a non-empty string, you get null, because you can’t concatenate an unknown string with a known one. Likewise with a zero value.

This rule then states that you have to have a sensible replacement value for nulls/unknowns. If you know that your query will produce nulls, for example a `CASE` statement, then you should provide a default value. The same idea can be applied when you’re selecting columns from an outer joined table. These are expected unknowns. 

In the realm of unexpected unknowns you might want to always replace a string with the value “unknown” if it’s a category or an empty string if you intend to concatenate it with other strings like for example middle name.

Integers are much harder to find default values for. Many times using 0 is not advisable because it can be a meaningful value already. Sometimes -1 is used but that also can have specific meaning. If you intend to do calculations with a value that can be null, you can replace it in-place the moment you need it.

