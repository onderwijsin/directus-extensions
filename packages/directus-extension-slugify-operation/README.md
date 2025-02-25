# Slugify operation
An operation for flows to slugify input values! This operation has been developed to be used directly upon `$trigger`. It takes input values, slugifies them, and adds an additional output field to the `$trigger.payload`


## Installation
Refer to the [Official Guide](https://docs.directus.io/extensions/installing-extensions.html) for details on installing the extension from the Marketplace or manually.

## Configuration
1. Set up a new flow with Event Hook trigger, filter (blocking), and choose which collections you want to slugify. You'll need to select the scope `items.create` and `items.update`, and set the response body to "Data of last operation"
2. Add the slugify operation. There you'll need to configure:
   1. The input fields. Use their field key as value. If you select multiple input fields, their values will al be used in the output slug.
   2. The output field key (for example: "slug"). This fieldkey will be added to the payload.
   3. The locale to use in when transforming characters.
   4. Whether to make the slug unique by appending a random 6 character string at the end. 
   5. Whether to lowercase the input values. Note that the random string CAN have capitals.

## Gotcha's
- Beware that all collections selected at step 1, need to have the input field keys in their field schema.
- If multiple input fields are selected, the output value will follow the order in which you selected the input keys
- If multiple input fields are selected, and you only modified one of these values, the operation will look up the existing value for the other input fields and use these. This means that support for multiple input fields (with lookup for exitsing values that are missing in the payload) will break, if you modify multiple items simulateously, since the operation cant return unique slug values for each item that was edited.

## Manual input 
You can also manually set a slug. If the `$trigger.payload[output_key]` contains a value, the operation will do nothing, except forcing the provided value to be URL safe.

That's it! Happy slugifying 😁