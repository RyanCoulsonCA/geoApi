'use strict';

const shared = require('./shared.js')();
const basicFC = require('./basicFC.js')();

/**
 * @class AttribFC
 */
class AttribFC extends basicFC.BasicFC {
    // attribute-specific variant for feature class object.
    // deals with stuff specific to a feature class that has attributes

    /**
     * Create an attribute specific feature class object
     * @param {Object} parent        the Record object that this Feature Class belongs to
     * @param {String} idx           the service index of this Feature Class. an integer in string format. use '0' for non-indexed sources.
     * @param {Object} layerPackage  a layer package object from the attribute module for this feature class
     * @param {Object} config        the config object for this sublayer
     */
    constructor (parent, idx, layerPackage, config) {
        // TEST STATUS basic
        super(parent, idx, config);

        this._layerPackage = layerPackage;

        // moar?
    }

    /**
    * Returns attribute data for this FC.
    *
    * @function getAttribs
    * @returns {Promise}         resolves with a layer attribute data object
    */
    getAttribs () {
        // TEST STATUS none
        return this._layerPackage.getAttribs();
    }

    /**
    * Returns layer-specific data for this FC.
    *
    * @function getLayerData
    * @returns {Promise}         resolves with a layer data object
    */
    getLayerData () {
        // TEST STATUS basic
        return this._layerPackage.layerData;
    }

    getSymbology () {
        // TEST STATUS basic
        if (!this._symbology) {
            this._symbology = this.getLayerData().then(lData => {
                if (lData.layerType === 'Feature Layer') {
                    // feature always has a single item, so index 0
                    return shared.makeSymbologyArray(lData.legend.layers[0].legend);
                } else {
                    // non-feature source. use legend server
                    return super.getSymbology();
                }
            });
        }
        return this._symbology;
    }

    /**
    * Extract the feature name from a feature as best we can.
    * Support for dynamic layers is limited at the moment. // TODO explain this comment
    *
    * @function getFeatureName
    * @param {String} objId      the object id of the attribute
    * @param {Object} attribs    optional. the dictionary of attributes for the feature. uses internal attributes if not provided.
    * @returns {Promise}         resolves with the name of the feature
    */
    getFeatureName (objId, attribs) {
        // TEST STATUS none
        let nameField = '';

        if (this.nameField) {
            nameField = this.nameField;
        } else if (this.parent._layer && this.parent._layer.displayField) {
            nameField = this.parent._layer.displayField;
        }

        if (nameField) {
            // determine if we have been given a set of attributes, or need to use our own
            let attribPromise;
            if (attribs) {
                attribPromise = Promise.resolve(attribs);
            } else {
                attribPromise = this.getAttribs().then(layerAttribs => {
                    return layerAttribs.features[layerAttribs.oidIndex[objId]].attributes;
                });
            }

            // after attributes are loaded, extract name
            return attribPromise.then(finalAttribs => {
                return finalAttribs[nameField];
            });
        } else {
            // FIXME wire in "feature" to translation service
            return Promise.resolve('Feature ' + objId);
        }
    }

    /**
     * Retrieves attributes from a layer for a specified feature index
     * @return {Promise}            promise resolving with formatted attributes to be consumed by the datagrid and esri feature identify
     */
    getFormattedAttributes () {
        // TEST STATUS basic
        if (this._formattedAttributes) {
            return this._formattedAttributes;
        }

        this._formattedAttributes = Promise.all([this.getAttribs(), this.getLayerData()])
            .then(([aData, lData]) => {
                // create columns array consumable by datables
                const columns = lData.fields
                    .filter(field =>

                        // assuming there is at least one attribute - empty attribute budnle promises should be rejected, so it never even gets this far
                        // filter out fields where there is no corresponding attribute data
                        aData.features[0].attributes.hasOwnProperty(field.name))
                    .map(field => ({
                        data: field.name,
                        title: field.alias || field.name
                    }));

                return {
                    columns,
                    rows: aData.features.map(feature => feature.attributes),
                    fields: lData.fields, // keep fields for reference ...
                    oidField: lData.oidField, // ... keep a reference to id field ...
                    oidIndex: aData.oidIndex, // ... and keep id mapping array
                    renderer: lData.renderer
                };
            })
            .catch(() => {
                delete this._formattedAttributes; // delete cached promise when the geoApi `getAttribs` call fails, so it will be requested again next time `getAttributes` is called;
                throw new Error('Attrib loading failed');
            });

        return this._formattedAttributes;
    }

    /**
     * Check to see if the attribute in question is an esriFieldTypeDate type.
     *
     * @param {String} attribName     the attribute name we want to check if it's a date or not
     * @return {Promise}              resolves to true or false based on the attribName type being esriFieldTypeDate
     */
    checkDateType (attribName) {
        // TEST STATUS none
        // grab attribute info (waiting for it it finish loading)
        return this.getLayerData().then(lData => {
            // inspect attribute fields
            if (lData.fields) {
                const attribField = lData.fields.find(field => {
                    return field.name === attribName;
                });
                if (attribField && attribField.type) {
                    return attribField.type === 'esriFieldTypeDate';
                }
            }
            return false;
        });
    }

    /**
     * Get the best user-friendly name of a field. Uses alias if alias is defined, else uses the system attribute name.
     *
     * @param {String} attribName     the attribute name we want a nice name for
     * @return {Promise}              resolves to the best available user friendly attribute name
     */
    aliasedFieldName (attribName) {
        // TEST STATUS none
        // grab attribute info (waiting for it it finish loading)
        return this.getLayerData().then(lData => {
            return AttribFC.aliasedFieldNameDirect(attribName, lData.fields);
        });

    }

    static aliasedFieldNameDirect (attribName, fields) {
        // TEST STATUS none
        let fName = attribName;

        // search for aliases
        if (fields) {
            const attribField = fields.find(field => {
                return field.name === attribName;
            });
            if (attribField && attribField.alias && attribField.alias.length > 0) {
                fName = attribField.alias;
            }
        }
        return fName;
    }

    /**
     * Convert an attribute set so that any keys using aliases are converted to proper fields
     *
     * @param  {Object} attribs      attribute key-value mapping, potentially with aliases as keys
     * @param  {Array} fields       fields definition array for layer
     * @return {Object}              attribute key-value mapping with fields as keys
     */
    static unAliasAttribs (attribs, fields) {
        // TEST STATUS none
        const newA = {};
        fields.forEach(field => {
            // attempt to extract on name. if not found, attempt to extract on alias
            // dump value into the result
            newA[field.name] = attribs.hasOwnProperty(field.name) ? attribs[field.name] : attribs[field.alias];
        });
        return newA;
    }

   // TODO perhaps a splitting of server url and layer index to make things consistent between feature and dynamic?
   //      could be on constructor, then parent can easily feed in the treats.

}

module.exports = () => ({
    AttribFC
});
