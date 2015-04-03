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
            tables: []
        };

        service.setActiveDataset = function(dataset) {
            service.dataset.name = dataset.name || "Unknown Dataset";
            service.dataset.layout = dataset.layout || "";
            service.dataset.datastore = dataset.datastore || "";
            service.dataset.hostname = dataset.hostname || "";
            service.dataset.database = dataset.database || "";
            service.dataset.tables = dataset.tables || [];

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
                return [];
            }

            var fieldExists = {};
            for(var i = 0; i < table.fields.length; ++i) {
                fieldExists[table.fields[i].columnName] = true;
            }

            for(var i = 0; i < fieldNames.length; ++i) {
                if(!fieldExists[fieldNames[i]]) {
                    table.fields.push({
                        columnName: fieldNames[i]
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
                return [];
            }

            return table.mappings[key];
        };

        service.setMapping = function(tableName, key, field) {
            var table = service.getTableWithName(tableName);

            if(!table.name) {
                return [];
            }

            table.mappings[key] = field;
        };

        return service;
    }
);
