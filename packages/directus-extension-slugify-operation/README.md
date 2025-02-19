# Slugify operation
An operation for flows to slugify input values! This operation has been developed to be used directly upon `$trigger`. It takes input values, slugifies them, and adds an additional output field to the `$trigger.payload`


## Installation
Refer to the [Official Guide](https://docs.directus.io/extensions/installing-extensions.html) for details on installing the extension from the Marketplace or manually.

## Configuration
1. Set up a new flow with Event Hook trigger, filter (blocking), and choose which collections you want to slugify. You'll need to select the scope `items.create` and `items.update`, and set the response body to "Data of ;ast operation"
2. Add the slugify operation. There you'll need to configure:
   1. The input fields. Use their field key as value. If you select multiple input fields, their values will al be used in the output slug. *Beware that all collections selected at step 1, need to have these keys in their field schema*
   2. The output field key (for example: "slug"). This fieldkey will be added to the payload
   3. Whether to make the slug unique by appending a random 6 character string at the end. 
   4. Whether to lowercase the input values. Note that the random string CAN have capitals

## Manual input 
You can also manually set a slug. If the `$trigger.payload[output_key]` contains a value, the operation will do nothing, except forcing the provided value to be URL safe.

That's it! Happy slugifying 😁

## To do
- [ ] fix bug where if only one of the input fields is provided, it shoudl look up the exsiting values of the other fields (which means a service is needed)
- check lang and getSlug implementation of https://github.com/muratgozel/directus-operation-slugify