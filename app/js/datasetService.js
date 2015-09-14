'use strict';
/*
 * Copyright 2015 Next Century Corporation
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 */

angular.module("neonDemo.services")
.factory("DatasetService", ["datasets", "$interval", function(datasets, $interval) {
    var service = {};

    service.datasets = datasets;

    // The active dataset.
    service.dataset = {
        name: "",
        layout: "",
        datastore: "",
        hostname: "",
        databases: []
    };

    // Use the Dataset Service to save settings for specific databases/tables and publish messages to all visualizations if those settings change.
    service.messenger = new neon.eventing.Messenger();

    // The Dataset Service saves the brush extent used to filter the date for each database/table.
    service.DATE_CHANGED_CHANNEL = "date_changed";

    // The Dataset Service may ask the visualizations to update their data.
    service.UPDATE_DATA_CHANNEL = "update_data";

    /**
     * Returns the list of datasets maintained by this service.
     * @method getDatasets
     * @return {Array}
     */
    service.getDatasets = function() {
        return service.datasets;
    };

    /**
     * Adds the given dataset to the list of datasets maintained by this service and returns the new list.
     * @method addDataset
     * @return {Array}
     */
    service.addDataset = function(dataset) {
        validateDatabases(dataset);
        service.datasets.push(dataset);
        return service.datasets;
    };

    /**
     * Sets the active dataset to the given dataset.
     * @param {Object} The dataset containing {String} name, {String} layout, {String} datastore, {String} hostname,
     * and {Array} databases.  Each database is an Object containing {String} name, {Array} tables, and {Array}
     * relations.  Each table is an Object containing {String} name, {Array} fields, and {Object} mappings.  Each
     * field is an Object containing {String} columnName and {String} prettyName.  Each mapping key is a unique
     * identifier used by the visualizations and each value is a field name.  Each relation is an Object with table
     * names as keys and field names as values.
     * @method setActiveDataset
     */
    service.setActiveDataset = function(dataset) {
        service.dataset.name = dataset.name || "Unknown Dataset";
        service.dataset.layout = dataset.layout || "";
        service.dataset.datastore = dataset.datastore || "";
        service.dataset.hostname = dataset.hostname || "";
        service.dataset.databases = dataset.databases || [];
        service.dataset.options = dataset.options || {};
        service.dataset.mapLayers = dataset.mapLayers || [];
        service.dataset.mapConfig = dataset.mapConfig || {};
        service.dataset.relations = dataset.relations || [];
        service.dataset.linkyConfig = dataset.linkyConfig || {};

        if(service.dataset.options.requeryInterval) {
            var delay = Math.max(0.5, service.dataset.options.requeryInterval) * 60000;
            $interval(publishUpdateData, delay);
        }
    };

    /**
     * Returns whether a dataset is active.
     * @method hasDataset
     * @return {Boolean}
     */
    service.hasDataset = function() {
        return service.dataset.datastore && service.dataset.hostname && service.dataset.databases.length;
    };

    /**
     * Returns the name of the active dataset.
     * @method getName
     * @return {String}
     */
    service.getName = function() {
        return service.dataset.name;
    };

    /**
     * Returns the layout for the active dataset.
     * @method getLayout
     * @return {String}
     */
    service.getLayout = function() {
        return service.dataset.layout;
    };

    /**
     * Returns the datastore for the active dataset.
     * @method getDatastore
     * @return {String}
     */
    service.getDatastore = function() {
        return service.dataset.datastore;
    };

    /**
     * Returns the hostname for the active dataset.
     * @method getHostname
     * @return {String}
     */
    service.getHostname = function() {
        return service.dataset.hostname;
    };

    /**
     * Returns the databases for the active dataset.
     * @method getDatabases
     * @return {Array}
     */
    service.getDatabases = function() {
        return service.dataset.databases;
    };

    /**
     * Returns the database with the given name or an Object with an empty name if no such database exists in the dataset.
     * @param {String} The database name
     * @method getDatabaseWithName
     * @return {Object} The database containing {String} name, {Array} fields, and {Object} mappings if a match exists
     * or undefined otherwise.
     */
    service.getDatabaseWithName = function(databaseName) {
        for(var i = 0; i < service.dataset.databases.length; ++i) {
            if(service.dataset.databases[i].name === databaseName) {
                return service.dataset.databases[i];
            }
        }

        return undefined;
    };

    /**
     * Returns the tables for the database with the given name in the active dataset.
     * @param {String} The database name
     * @method getTables
     * @return {Array} An array of table Objects containing {String} name, {Array} fields, and {Array} mappings.
     */
    service.getTables = function(databaseName) {
        return service.getDatabaseWithName(databaseName).tables;
    };

    /**
     * Returns the table with the given name or an Object with an empty name if no such table exists in the database with the given name.
     * @param {String} The database name
     * @param {String} The table name
     * @method getTableWithName
     * @return {Object} The table containing {String} name, {Array} fields, and {Object} mappings if a match exists
     * or undefined otherwise.
     */
    service.getTableWithName = function(databaseName, tableName) {
        var tables = service.getTables(databaseName);
        for(var i = 0; i < tables.length; ++i) {
            if(tables[i].name === tableName) {
                return tables[i];
            }
        }

        return undefined;
    };

    /**
     * Returns a map of database names to an array of table names within that database.
     * @method getDatabaseAndTableNames
     * @return {Object}
     */
    service.getDatabaseAndTableNames = function() {
        var databases = service.getDatabases();
        var names = {};
        for(var i = 0; i < databases.length; ++i) {
            names[databases[i].name] = [];
            var tables = service.getTables(databases[i].name);
            for(var j = 0; j < tables.length; ++j) {
                names[databases[i].name].push(tables[j].name);
            }
        }
        return names;
    };

    /**
     * Returns the name of the first table in the database with the given name containing all the given mappings.
     * @param {String} The database name
     * @param {Array} The array of mapping keys that the table must contain.
     * @method getFirstTableWithMappings
     * @return {String} The name of the table containing {String} name, {Array} fields, and {Object} mappings if a match exists
     * or undefined otherwise.
     */
    service.getFirstTableWithMappings = function(databaseName, keys) {
        var tables = service.getTables(databaseName);
        for(var i = 0; i < tables.length; ++i) {
            var success = true;
            for(var j = 0; j < keys.length; ++j) {
                if(!(tables[i].mappings[keys[j]])) {
                    success = false;
                    break;
                }
            }
            if(success) {
                return tables[i];
            }
        }

        return undefined;
    };

    /**
     * Returns the field objects for the database and table with the given names.
     * @param {String} The database name
     * @param {String} The table name
     * @method getFields
     * @return {Array} The array of field objects if a match exists or an empty array otherwise.
     */
    service.getFields = function(databaseName, tableName) {
        var table = service.getTableWithName(databaseName, tableName);

        if(!table) {
            return [];
        }

        return table.fields;
    };

    /**
     * Returns a sorted copy of the array of field objects for the database and table with the given names, ignoring hidden fields if specified.
     * @param {String} The database name
     * @param {String} The table name
     * @param {Boolean} Whether to ignore fields in the table marked as hidden (optional)
     * @method getSortedFields
     * @return {Array} The sorted copy of the array of field objects if a match exists or an empty array otherwise.
     */
    service.getSortedFields = function(databaseName, tableName, ignoreHiddenFields) {
        var table = service.getTableWithName(databaseName, tableName);

        if(!table) {
            return [];
        }

        var fields = angular.copy(table.fields).filter(function(field) {
            return ignoreHiddenFields ? !field.hide : true;
        });

        fields.sort(function(x, y) {
            // Compare field pretty names and ignore case.
            return (x.prettyName.toUpperCase() < y.prettyName.toUpperCase()) ? -1 : ((x.prettyName.toUpperCase() > y.prettyName.toUpperCase()) ? 1 : 0);
        });

        return fields;
    };

    /**
     * Returns the mappings for the table with the given name.
     * @param {String} The database name
     * @param {String} The table name
     * @method getMappings
     * @return {Object} The mappings if a match exists or an empty object otherwise.
     */
    service.getMappings = function(databaseName, tableName) {
        var table = service.getTableWithName(databaseName, tableName);

        if(!table) {
            return {};
        }

        return table.mappings;
    };

    /**
     * Returns the mapping for the table with the given name and the given key.
     * @param {String} The database name
     * @param {String} The table name
     * @param {String} The mapping key
     * @method getMapping
     * @return {String} The field name for the mapping at the given key if a match exists or an empty string
     * otherwise.
     */
    service.getMapping = function(databaseName, tableName, key) {
        var table = service.getTableWithName(databaseName, tableName);

        if(!table) {
            return "";
        }

        return table.mappings[key];
    };

    /**
     * Sets the mapping for the table with the given name at the given key to the given field name.
     * @param {String} The database name
     * @param {String} The table name
     * @param {String} The mapping key
     * @param {String} The field name for the given mapping key
     * @method setMapping
     */
    service.setMapping = function(databaseName, tableName, key, fieldName) {
        var table = service.getTableWithName(databaseName, tableName);

        if(!table) {
            return;
        }

        table.mappings[key] = fieldName;
    };

    /**
     * Returns an array of relations for the given database, table, and fields.  The given table is related to another table if
     * the database contains relations mapping each given field name to the other table.
     * @param {String} The database name
     * @param {String} The table name
     * @param {Array} The array of field names
     * @method getRelations
     * @return {Array} The array of relation objects which contain the table name ({String} table) and a mapping of
     * the given field names to the field names in the other tables ({Object} fields).  This array will also contain
     * the relation object for the table and fields given in the arguments
     */
    service.getRelations = function(databaseName, tableName, fieldNames) {
        var relations = service.dataset.relations;

        var initializeMapAsNeeded = function(map, key1, key2) {
            if(!(map[key1])) {
                map[key1] = {};
            }
            if(!(map[key1][key2])) {
                map[key1][key2] = [];
            }
            return map;
        };

        // First we create a mapping of a relation's database/table/field to its related fields.
        var relationToFields = {};

        // Iterate through each field to find its relations.
        fieldNames.forEach(function(fieldName) {
            // Iterate through each relation to compare with the current field.
            relations.forEach(function(relation) {
                // If the current relation contains a match for the input database/table/field, iterate through the elements in the current relation.
                if(relation[databaseName] && fieldName === relation[databaseName][tableName]) {
                    var databaseNames = Object.keys(relation);
                    // Add each database/table/field in the current relation to the map.  Note that this will include the input database/table/field.
                    databaseNames.forEach(function(relationDatabaseName) {
                        var tableNames = Object.keys(relation[relationDatabaseName]);
                        tableNames.forEach(function(relationTableName) {
                            var relationFieldName = relation[relationDatabaseName][relationTableName];
                            relationToFields = initializeMapAsNeeded(relationToFields, relationDatabaseName, relationTableName);

                            var existingFieldIndex = relationToFields[relationDatabaseName][relationTableName].map(function(object) {
                                return object.initial;
                            }).indexOf(fieldName);

                            // If the database/table/field exists in the relation...
                            if(existingFieldIndex >= 0) {
                                // If the relation field exists in the relation, don't add it again.
                                if(relationToFields[relationDatabaseName][relationTableName][existingFieldIndex].related.indexOf(relationFieldName) >= 0) {
                                    return;
                                }
                                // Else add the related field.
                                relationToFields[relationDatabaseName][relationTableName][existingFieldIndex].related.push(relationFieldName);
                            } else {
                                // Else create a new object for the database/table/field in the relation and add its related field.
                                relationToFields[relationDatabaseName][relationTableName].push({
                                    initial: fieldName,
                                    related: [relationFieldName]
                                });
                            }
                        });
                    });
                }
            });
        });

        var resultDatabaseNames = Object.keys(relationToFields);
        if(resultDatabaseNames.length) {
            var results = [];
            // Iterate through the relations for each relation's database/table/field and add a relation object for each database/table pair to the final list of results.
            resultDatabaseNames.forEach(function(resultDatabaseName) {
                var resultTableNames = Object.keys(relationToFields[resultDatabaseName]);
                resultTableNames.forEach(function(resultTableName) {
                    results.push({
                        database: resultDatabaseName,
                        table: resultTableName,
                        fields: relationToFields[resultDatabaseName][resultTableName]
                    });
                });
            });
            return results;
        }

        // If the input fields do not have any related fields in other tables, return a list containing a relation object for the input database/table/fields.
        var result = {
            database: databaseName,
            table: tableName,
            fields: []
        };

        fieldNames.forEach(function(fieldName) {
            result.fields.push({
                initial: fieldName,
                related: [fieldName]
            });
        });

        return [result];
    };

    /**
     * Returns the initial configuration parameters for any maps in this dataset.
     * @method getMapConfig
     * @return {String}
     */
    service.getMapConfig = function() {
        return service.dataset.mapConfig;
    };

    /**
     * Sets the map layer configuration for the active dataset.
     * @param {object} config Initial configuration parameters for any maps in this dataset.
     * @method setMapConfig
     */
    service.setMapConfig = function(config) {
        service.dataset.mapConfig = config;
    };

    /**
     * Returns the map layer configuration for the active dataset.
     * @method getMapLayers
     * @return {String}
     */
    service.getMapLayers = function() {
        return service.dataset.mapLayers;
    };

    /**
     * Sets the map layer configuration for the active dataset.
     * @param {object} config A set of layer configuration objects.
     * @method setMapLayers
     */
    service.setMapLayers = function(config) {
        service.dataset.mapLayers = config;
    };

    /**
     * Returns the linky configuration for the active dataset.
     * @method getLinkyConfig
     * @return {Object}
     */
    service.getLinkyConfig = function() {
        return service.dataset.linkyConfig;
    };

    /**
     * Sets the linky configuration for the active dataset.
     * @param {Object} config A linky configuration object
     * @param {Boolean} config.mentions If mentions should be linked
     * @param {Boolean} config.hashtags If hashtags should be linked
     * @param {Boolean} config.urls If URLs should be linked
     * @param {String} config.linkTo Location where mentions and hashtags
     * should be linked to. Options: "twitter", "instagram", "github"
     * @method setLinkyConfig
     */
    service.setLinkyConfig = function(config) {
        service.dataset.linkyConfig = config;
    };

    /**
     * Returns the map of date filter keys for this dataset.
     * @method getDateFilterKeys
     * @return {Object}
     */
    service.getDateFilterKeys = function() {
        var dateFilterKeys = {};
        service.dataset.databases.forEach(function(database) {
            dateFilterKeys[database.name] = {};
            database.tables.forEach(function(table) {
                dateFilterKeys[database.name][table.name] = table.dateFilterKey ? table.dateFilterKey : "";
            });
        });
        return dateFilterKeys;
    };

    /**
     * Publishes a date changed message with the given database name, table name, and brush extent.
     * @param {String} databaseName
     * @param {String} tableName
     * @param {Array} brushExtent
     * @method publishDateChanged
     * @private
     */
    var publishDateChanged = function(databaseName, tableName, brushExtent) {
        service.messenger.publish(service.DATE_CHANGED_CHANNEL, {
            databaseName: databaseName,
            tableName: tableName,
            brushExtent: brushExtent
        });
    };

    /**
     * Sets the date brush extent for the databases and tables in the given relations to the given brush extent and publishes a date changed message for each.
     * @param {Array} relations
     * @param {Array} brushExtent
     * @method setDateBrushExtentForRelations
     */
    service.setDateBrushExtentForRelations = function(relations, brushExtent) {
        relations.forEach(function(relation) {
            var table = service.getTableWithName(relation.database, relation.table);
            if(table) {
                table.dateBrushExtent = brushExtent;
                publishDateChanged(relation.database, relation.table, brushExtent);
            }
        });
    };

    /**
     * Returns the date brush extent for the database and table with the given names or an empty array if no brush extent has been set.
     * @param {String} databaseName
     * @param {String} tableName
     * @method getDateBrushExtent
     * @return {Array}
     */
    service.getDateBrushExtent = function(databaseName, tableName) {
        var table = service.getTableWithName(databaseName, tableName);
        return (table && table.dateBrushExtent) ? table.dateBrushExtent : [];
    };

    /**
     * Removes the date brush extent for the databases and tables in the given relations and publishes a date changed message for each.
     * @param {Array} relations
     * @method removeDateBrushExtentForRelations
     */
    service.removeDateBrushExtentForRelations = function(relations) {
        relations.forEach(function(relation) {
            var table = service.getTableWithName(relation.database, relation.table);
            if(table) {
                table.dateBrushExtent = [];
                publishDateChanged(relation.database, relation.table, []);
            }
        });
    };

    /**
     * Updates the database at the given index (default 0) from the given dataset by adding undefined fields for each table.
     * @param {Object} dataset
     * @param {Object} connection
     * @param {Function} callback (optional)
     * @param {Number} index (optional)
     * @method updateDatabases
     * @private
     */
    service.updateDatabases = function(dataset, connection, callback, index) {
        var databaseIndex = index ? index : 0;
        var database = dataset.databases[databaseIndex];
        connection.getTableNamesAndFieldNames(database.name, function(tableNamesAndFieldNames) {
            Object.keys(tableNamesAndFieldNames).forEach(function(tableName) {
                var table = _.find(database.tables, function(table) {
                    return table.name === tableName;
                });

                if(table) {
                    var hasField = {};
                    table.fields.forEach(function(field) {
                        hasField[field.columnName] = true;
                    });

                    tableNamesAndFieldNames[tableName].forEach(function(fieldName) {
                        if(!hasField[fieldName]) {
                            table.fields.push({
                                columnName: fieldName,
                                prettyName: fieldName
                            });
                        }
                    });
                }
            });

            if(++databaseIndex < dataset.databases.length) {
                service.updateDatabases(dataset, connection, callback, databaseIndex);
            } else if(callback) {
                dataset.hasUpdatedFields = true;
                callback(dataset);
            }
        });
    };

    var removeFromArray = function(array, indexList) {
        indexList.forEach(function(index) {
            array.splice(index, 1);
        });
    };

    var validateFields = function(table) {
        var indexListToRemove = [];
        table.fields.forEach(function(field, index) {
            if(!field.columnName) {
                indexListToRemove.push(index);
            } else {
                field.prettyName = field.prettyName || field.columnName;
            }
        });
        removeFromArray(table.fields, indexListToRemove);
    };

    var validateTables = function(database) {
        var indexListToRemove = [];
        database.tables.forEach(function(table, index) {
            if(!table.name) {
                indexListToRemove.push(index);
            } else {
                table.prettyName = table.prettyName || table.name;
                table.fields = table.fields || [];
                table.mappings = table.mappings || {};
                // Create a filter key for each database/table pair with a date mapping.
                if(table.mappings.date) {
                    table.dateFilterKey = "date-" + database.name + "-" + table.name + "-" + uuid();
                }
                validateFields(table);
            }
        });
        removeFromArray(database.tables, indexListToRemove);
    };

    var validateDatabases = function(dataset) {
        var indexListToRemove = [];
        dataset.databases.forEach(function(database, index) {
            if(!(database.name || database.tables || database.tables.length)) {
                indexListToRemove.push(index);
            } else {
                database.prettyName = database.prettyName || database.name;
                validateTables(database);
            }
        });
        removeFromArray(dataset.databases, indexListToRemove);
    };

    /**
     * Publishes an update data message.
     * @method publishUpdateData
     * @private
     */
    var publishUpdateData = function() {
        service.messenger.publish(service.UPDATE_DATA_CHANNEL, {});
    };

    /**
     * Returns the options for the active dataset.
     * @method getActiveDatasetOptions
     * @return {Object}
     */
    service.getActiveDatasetOptions = function() {
        return service.dataset.options;
    };

    // Validate the datasets from the configuration file on initialization.
    service.datasets.forEach(function(dataset) {
        validateDatabases(dataset);
    });

    return service;
}]);
