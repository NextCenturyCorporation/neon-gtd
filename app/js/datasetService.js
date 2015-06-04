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
.factory("DatasetService",
    function() {
        var service = {};

        service.dataset = {
            name: "",
            layout: "",
            datastore: "",
            hostname: "",
            databases: []
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

            service.dataset.mapLayers = dataset.mapLayers || [];
            service.dataset.relations = dataset.relations || [];

            // Remove databases from the dataset that contain no tables.
            var databaseIndexToRemove = [];
            for(var i = 0; i < service.dataset.databases.length; ++i) {
                if(!service.dataset.databases[i].prettyName) {
                    service.dataset.databases[i].prettyName = service.dataset.databases[i].name;
                }
                if(!(service.dataset.databases[i].tables || service.dataset.databases[i].tables.length)) {
                    databaseIndexToRemove.push(i);
                }
            }

            for(var i = databaseIndexToRemove.length; i > 0; --i) {
                service.dataset.databases.splice(i, 1);
            }

            for(var i = 0; i < service.dataset.databases.length; ++i) {
                for(var j = 0; j < service.dataset.databases[i].tables.length; ++j) {
                    if(!service.dataset.databases[i].tables[j].prettyName) {
                        service.dataset.databases[i].tables[j].prettyName = service.dataset.databases[i].tables[j].name;
                    }
                    service.dataset.databases[i].tables[j].fields = service.dataset.databases[i].tables[j].fields || [];
                    service.dataset.databases[i].tables[j].mappings = service.dataset.databases[i].tables[j].mappings || {};
                }
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
         * Returns the database field names for the table with the given name.
         * @param {String} The database name
         * @param {String} The table name
         * @method getDatabaseFields
         * @return {Array} The array of database field names if a match exists or an empty array otherwise.
         */
        service.getDatabaseFields = function(databaseName, tableName) {
            var table = service.getTableWithName(databaseName, tableName);

            if(!table) {
                return [];
            }

            var databaseFields = [];
            for(var i = 0; i < table.fields.length; ++i) {
                databaseFields.push(table.fields[i].columnName);
            }
            return databaseFields;
        };

        /**
         * Returns the pretty field names for the table with the given name.
         * @param {String} The database name
         * @param {String} The table name
         * @method getPrettyFields
         * @return {Array} The array of pretty field names if a match exists or an empty array otherwise.
         */
        service.getPrettyFields = function(databaseName, tableName) {
            var table = service.getTableWithName(databaseName, tableName);

            if(!table) {
                return [];
            }

            var prettyFields = [];
            for(var i = 0; i < table.fields.length; ++i) {
                prettyFields.push(table.fields[i].prettyName || table.fields[i].columnName);
            }
            return prettyFields;
        };

        /**
         * Returns the pretty field name for the field with the given name in the table with the given name.
         * @param {String} The table name
         * @param {String} The field name
         * @method getPrettyFields
         * @return {String} The pretty field name if a match exists or undefined otherwise.
         */
        service.getPrettyField = function(tableName, fieldName) {
            var table = service.getTableWithName(tableName);

            for(var i = 0; i < table.fields.length; ++i) {
                var field = table.fields[i];
                if(field.columnName === fieldName) {
                    return field.prettyName || field.columnName;
                }
            }

            return undefined;
        };

        /**
         * Updates the fields for the table with the given name to include all of the given fields it does not already
         * contain.
         * @param {String} The database name
         * @param {String} The table name
         * @param {Array} The array of database field names to add
         * @method updateFields
         */
        service.updateFields = function(databaseName, tableName, fieldNames) {
            var table = service.getTableWithName(databaseName, tableName);

            if(!table) {
                return;
            }

            var fieldExists = {};
            for(var i = 0; i < table.fields.length; ++i) {
                fieldExists[table.fields[i].columnName] = true;
            }

            for(var j = 0; j < fieldNames.length; ++j) {
                if(!fieldExists[fieldNames[j]]) {
                    table.fields.push({
                        columnName: fieldNames[j]
                    });
                }
            }
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
            var i, j, k, l;
            var relations = service.dataset.relations;

            var initializeMap = function(map, key1, key2, key3) {
                if(!(map[key1])) {
                    map[key1] = {};
                }
                if(!(map[key1][key2])) {
                    map[key1][key2] = {};
                }
                if(!(map[key1][key2][key3])) {
                    map[key1][key2][key3] = [];
                }
                return map;
            };

            // First we create a mapping of a relation's database/table/field to its related fields.
            var relationToFields = {};

            // Iterate through each field to find its relations.
            for(i = 0; i < fieldNames.length; ++i) {
                var fieldName = fieldNames[i];
                // Iterate through each relation to compare with the current field.
                for(j = 0; j < relations.length; ++j) {
                    var relation = relations[j];
                    // If the current relation contains a match for the input database/table/field, iterate through the elements in the current relation.
                    if(relation[databaseName] && fieldName === relation[databaseName][tableName]) {
                        var databaseNames = Object.keys(relation);
                        for(k = 0; k < databaseNames.length; ++k) {
                            var relationDatabaseName = databaseNames[k];
                            var tableNames = Object.keys(relation[relationDatabaseName]);
                            for(l = 0; l < tableNames.length; ++l) {
                                var relationTableName = tableNames[l];
                                var relationFieldName = relation[relationDatabaseName][relationTableName];
                                relationToFields = initializeMap(relationToFields, relationDatabaseName, relationTableName, fieldName);
                                // Add each database/table/field in the current relation to the map.  Note that this will include the input database/table/field.
                                relationToFields[relationDatabaseName][relationTableName][fieldName].push(relationFieldName);
                            }
                        }
                    }
                }
            }

            var resultDatabaseNames = Object.keys(relationToFields);
            if(resultDatabaseNames.length) {
                var results = [];
                // Iterate through the relations for each relation's database/table/field and add a relation object for each database/table pair to the final list of results.
                for(i = 0; i < resultDatabaseNames.length; ++i) {
                    var resultTableNames = Object.keys(relationToFields[resultDatabaseNames[i]]);
                    for(j = 0; j < resultTableNames.length; ++j) {
                        results.push({
                            database: resultDatabaseNames[i],
                            table: resultTableNames[j],
                            fields: relationToFields[resultDatabaseNames[i]][resultTableNames[j]]
                        });
                    }
                }
                return results;
            }

            // If the input fields do not have any related fields in other tables, return a list containing a relation object for the input database/table/fields.
            var result = {
                database: databaseName,
                table: tableName,
                fields: {}
            };

            for(i = 0; i < fieldNames.length; ++i) {
                result.fields[fieldNames[i]] = [fieldNames[i]];
            }

            return [result];
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
         * Returns the map layer configuration for the active dataset.
         * @param {object} config A set of layer configuration objects.
         * @method setMapLayers
         */
        service.setMapLayers = function(config) {
            service.dataset.mapLayers = config;
        };

        return service;
    }
);
