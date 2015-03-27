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
            datastore: "",
            hostname: "",
            database: "",
            tables: []
        };

        service.setActiveDataset = function(dataset) {
            service.dataset.name = dataset.name || "Unknown Dataset";
            service.dataset.datastore = dataset.datastore || "";
            service.dataset.hostname = dataset.hostname || "";
            service.dataset.database = dataset.database || "";
            service.dataset.tables = dataset.tables || [];
        };

        service.hasDataset = function() {
            return service.dataset.datastore && service.dataset.hostname && service.dataset.database && service.dataset.tables;
        };

        service.getName = function() {
            return service.dataset.name;
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

        /**
         * @Deprecated
         */
        service.getTable = function() {
            return service.dataset.tables ? service.dataset.tables[0].name : "";
        };

        service.getTables = function() {
            return service.dataset.tables;
        };

        service.getDatabaseFields = function() {
            if(!service.dataset.tables.length) {
                return [];
            }

            var databaseFields = [];
            for(var i = 0; i < service.dataset.tables[0].fields.length; ++i) {
                databaseFields.push(service.dataset.tables[0].fields[i].columnName);
            }
            return databaseFields;
        };

        service.getPrettyFields = function() {
            if(!service.dataset.tables.length) {
                return [];
            }

            var prettyFields = [];
            for(var i = 0; i < service.dataset.tables[0].fields.length; ++i) {
                prettyFields.push(service.dataset.tables[0].fields[i].prettyName || service.dataset.tables[0].fields[i].columnName);
            }
            return prettyFields;
        };

        service.updateFields = function(fieldNames) {
            if(!service.dataset.tables.length) {
                return;
            }

            var fieldExists = {};
            for(var i = 0; i < service.dataset.tables[0].fields.length; ++i) {
                fieldExists[service.dataset.tables[0].fields[i].columnName] = true;
            }

            for(var i = 0; i < fieldNames.length; ++i) {
                if(!fieldExists[fieldNames[i]]) {
                    service.dataset.tables[0].fields.push({
                        columnName: fieldNames[i]
                    });
                }
            }
        };

        service.getMappings = function() {
            if(!service.dataset.tables.length) {
                return [];
            }

            return service.dataset.tables[0].mappings;
        };

        service.getMapping = function(key) {
            if(!service.dataset.tables.length) {
                return "";
            }

            return service.dataset.tables[0].mappings[key];
        };

        service.setMapping = function(key, field) {
            if(!service.dataset.tables.length) {
                return;
            }

            service.dataset.tables[0].mappings[key] = field;
        };

        return service;
    }
);
