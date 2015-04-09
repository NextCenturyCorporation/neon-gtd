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

        service.hasDataset = function() {
            return service.dataset.datastore && service.dataset.hostname && service.dataset.database && service.dataset.tables;
        };

        service.getName = function() {
            return service.dataset.name;
        };

        service.getLayout = function() {
            return service.dataset.layout;
        };

        service.getDatastore = function() {
            return service.dataset.datastore;
        };

        service.getHostname = function() {
            return service.dataset.hostname;
        };

        service.getDatabase = function() {
            return service.dataset.database;
        };

        service.getTables = function() {
            return service.dataset.tables;
        };

        service.getTableWithName = function(tableName) {
            for(var i = 0; i < service.dataset.tables.length; ++i) {
                if(service.dataset.tables[i].name === tableName) {
                    return service.dataset.tables[i];
                }
            }

            return {
                name: ""
            };
        };

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

        service.getDatabaseFields = function(tableName) {
            var table = service.getTableWithName(tableName);

            if(!table.name) {
                return [];
            }

            var databaseFields = [];
            for(var i = 0; i < table.fields.length; ++i) {
                databaseFields.push(table.fields[i].columnName);
            }
            return databaseFields;
        };

        service.getPrettyFields = function(tableName) {
            var table = service.getTableWithName(tableName);

            if(!table.name) {
                return [];
            }

            var prettyFields = [];
            for(var i = 0; i < table.fields.length; ++i) {
                prettyFields.push(table.fields[i].prettyName || table.fields[i].columnName);
            }
            return prettyFields;
        };

        service.updateFields = function(tableName, fieldNames) {
            var table = service.getTableWithName(tableName);

            if(!table.name) {
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

        service.getMappings = function(tableName) {
            var table = service.getTableWithName(tableName);

            if(!table.name) {
                return [];
            }

            return table.mappings;
        };

        service.getMapping = function(tableName, key) {
            var table = service.getTableWithName(tableName);

            if(!table.name) {
                return "";
            }

            return table.mappings[key];
        };

        service.setMapping = function(tableName, key, fieldName) {
            var table = service.getTableWithName(tableName);

            if(!table.name) {
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
                            tablesToFields[relationTableName][fieldName] = relationFieldName;
                        }
                    }
                }
            }

            var relationTableNames = Object.keys(tablesToFields);
            if(relationTableNames.length) {
                var relations = [];
                for(i = 0; i < relationTableNames.length; ++i) {
                    relations.push({
                        table: relationTableNames[i],
                        fields: tablesToFields[relationTableNames[i]]
                    });
                }
                return relations;
            }

            // If the input fields do not have any related fields in other tables, return an object containing the input table and fields.
            var inputObject = {
                table: tableName,
                fields: {}
            };

            for(i = 0; i < fieldNames.length; ++i) {
                inputObject.fields[fieldNames[i]] = fieldNames[i];
            }

            return [inputObject];
        };

        return service;
    }
);
