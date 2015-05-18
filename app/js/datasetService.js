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
            database: "",
            tables: [],
            relations: []
        };

        /**
         * Sets the active dataset to the given dataset.
         * @param {Object} The dataset containing {String} name, {String} layout, {String} datastore, {String} hostname,
         * {String} database, {Array} tables, and {Array} relations.  Each table is an Object containing {String} name,
         * {Array} fields, and {Object} mappings.  Each field is an Object containing {String} columnName and {String}
         * prettyName.  Each mapping key is a unique identifier used by the visualizations and each value is a field
         * name.  Each relation is an Object with table names as keys and field names as values.
         * @method setActiveDataset
         */
        service.setActiveDataset = function(dataset) {
            service.dataset.name = dataset.name || "Unknown Dataset";
            service.dataset.layout = dataset.layout || "";
            service.dataset.datastore = dataset.datastore || "";
            service.dataset.hostname = dataset.hostname || "";
            service.dataset.database = dataset.database || "";
            service.dataset.tables = dataset.tables || [];
            service.dataset.relations = dataset.relations || [];

            for(var i = 0; i < service.dataset.tables.length; ++i) {
                service.dataset.tables[i].fields = service.dataset.tables[i].fields || [];
                service.dataset.tables[i].mappings = service.dataset.tables[i].mappings || {};
            }
        };

        /**
         * Returns whether a dataset is active.
         * @method hasDataset
         * @return {Boolean}
         */
        service.hasDataset = function() {
            return service.dataset.datastore && service.dataset.hostname && service.dataset.database && service.dataset.tables;
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
         * Returns the database for the active dataset.
         * @method getDatabase
         * @return {String}
         */
        service.getDatabase = function() {
            return service.dataset.database;
        };

        /**
         * Returns the tables for the active dataset.
         * @method getTables
         * @return {Array} An array of table Objects containing {String} name, {Array} fields, and {Array} mappings.
         */
        service.getTables = function() {
            return service.dataset.tables;
        };

        /**
         * Returns the table with the given name or an Object with an empty name if no such table exists in the dataset.
         * @param {String} The table name
         * @method getTableWithName
         * @return {Object} The table containing {String} name, {Array} fields, and {Object} mappings if a match exists
         * or undefined otherwise.
         */
        service.getTableWithName = function(tableName) {
            for(var i = 0; i < service.dataset.tables.length; ++i) {
                if(service.dataset.tables[i].name === tableName) {
                    return service.dataset.tables[i];
                }
            }

            return undefined;
        };

        /**
         * Returns the first table in the dataset containing all the given mappings.
         * @param {Array} The array of mapping keys that the table must contain.
         * @method getFirstTableWithMappings
         * @return {Object} The table containing {String} name, {Array} fields, and {Object} mappings if a match exists
         * or undefined otherwise.
         */
        service.getFirstTableWithMappings = function(keys) {
            for(var i = 0; i < service.dataset.tables.length; ++i) {
                var success = true;
                for(var j = 0; j < keys.length; ++j) {
                    if(!(service.dataset.tables[i].mappings[keys[j]])) {
                        success = false;
                        break;
                    }
                }
                if(success) {
                    return service.dataset.tables[i];
                }
            }

            return undefined;
        };

        /**
         * Returns the database field names for the table with the given name.
         * @param {String} The table name
         * @method getDatabaseFields
         * @return {Array} The array of database field names if a match exists or an empty array otherwise.
         */
        service.getDatabaseFields = function(tableName) {
            var table = service.getTableWithName(tableName);

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
         * @param {String} The table name
         * @method getPrettyFields
         * @return {Array} The array of pretty field names if a match exists or an empty array otherwise.
         */
        service.getPrettyFields = function(tableName) {
            var table = service.getTableWithName(tableName);

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
         * Updates the fields for the table with the given name to include all of the given fields it does not already
         * contain.
         * @param {String} The table name
         * @param {Array} The array of database field names to add
         * @method updateFields
         */
        service.updateFields = function(tableName, fieldNames) {
            var table = service.getTableWithName(tableName);

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
         * @param {String} The table name
         * @method getMappings
         * @return {Object} The mappings if a match exists or an empty object otherwise.
         */
        service.getMappings = function(tableName) {
            var table = service.getTableWithName(tableName);

            if(!table) {
                return {};
            }

            return table.mappings;
        };

        /**
         * Returns the mapping for the table with the given name and the given key.
         * @param {String} The table name
         * @param {String} The mapping key
         * @method getMapping
         * @return {String} The field name for the mapping at the given key if a match exists or an empty string
         * otherwise.
         */
        service.getMapping = function(tableName, key) {
            var table = service.getTableWithName(tableName);

            if(!table) {
                return "";
            }

            return table.mappings[key];
        };

        /**
         * Sets the mapping for the table with the given name at the given key to the given field name.
         * @param {String} The table name
         * @param {String} The mapping key
         * @param {String} The field name for the given mapping key
         * @method setMapping
         */
        service.setMapping = function(tableName, key, fieldName) {
            var table = service.getTableWithName(tableName);

            if(!table) {
                return;
            }

            table.mappings[key] = fieldName;
        };

        /**
         * Returns an array of relations for the given table and fields.  The given table is related to another table if
         * the dataset contains relations mapping each given field name to the other table.
         * @param {String} The table name
         * @param {Array} The array of field names
         * @method getRelations
         * @return {Array} The array of relation objects which contain the table name ({String} table) and a mapping of
         * the given field names to the field names in the other tables ({Object} fields).  This array will also contain
         * the relation object for the table and fields given in the arguments
         */
        service.getRelations = function(tableName, fieldNames) {
            var tablesToFields = {};
            for(var i = 0; i < fieldNames.length; ++i) {
                var fieldName = fieldNames[i];
                for(var j = 0; j < service.dataset.relations.length; ++j) {
                    if(fieldName === service.dataset.relations[j][tableName]) {
                        var tableNames = Object.keys(service.dataset.relations[j]);
                        for(var k = 0; k < tableNames.length; ++k) {
                            var relationTableName = tableNames[k];
                            var relationFieldName = service.dataset.relations[j][relationTableName];
                            if(!(tablesToFields[relationTableName])) {
                                tablesToFields[relationTableName] = {};
                            }
                            if(!(tablesToFields[relationTableName][fieldName])) {
                                tablesToFields[relationTableName][fieldName] = [];
                            }
                            tablesToFields[relationTableName][fieldName].push(relationFieldName);
                        }
                    }
                }
            }

            var relationTableNames = Object.keys(tablesToFields);
            if(relationTableNames.length) {
                var relations = [];
                for(i = 0; i < relationTableNames.length; ++i) {
                    relations.push({
                        database: service.getDatabase(),
                        table: relationTableNames[i],
                        fields: tablesToFields[relationTableNames[i]]
                    });
                }
                return relations;
            }

            // If the input fields do not have any related fields in other tables, return a list containing an object for the input table and fields.
            var relationForInput = {
                database: service.getDatabase(),
                table: tableName,
                fields: {}
            };

            for(i = 0; i < fieldNames.length; ++i) {
                relationForInput.fields[fieldNames[i]] = [fieldNames[i]];
            }

            return [relationForInput];
        };

        return service;
    }
);
