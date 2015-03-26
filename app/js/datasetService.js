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
            table: "",
            fields: [],
            mappings: {}
        }

        service.setActiveDataset = function(dataset) {
            service.dataset.name = dataset.name || "Unknown Dataset";
            service.dataset.datastore = dataset.datastore || "";
            service.dataset.hostname = dataset.hostname || "";
            service.dataset.database = dataset.database || "";
            service.dataset.table = dataset.table || "";
            service.dataset.fields = dataset.fields || [];
            service.dataset.mappings = dataset.mappings || {};
        };

        service.hasDataset = function() {
            return service.dataset.datastore && service.dataset.hostname && service.dataset.database && service.dataset.table;
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

        service.getTable = function() {
            return service.dataset.table;
        };

        service.getDatabaseFields = function() {
            var databaseFields = [];
            for(var i = 0; i < service.dataset.fields.length; ++i) {
                databaseFields.push(service.dataset.fields[i].columnName);
            }
            return databaseFields;
        };

        service.getPrettyFields = function() {
            var prettyFields = [];
            for(var i = 0; i < service.dataset.fields.length; ++i) {
                prettyFields.push(service.dataset.fields[i].prettyName || service.dataset.fields[i].columnName);
            }
            return prettyFields;
        };

        service.updateFields = function(fieldNames) {
            var fieldExists = {};
            for(var i = 0; i < service.dataset.fields.length; ++i) {
                fieldExists[service.dataset.fields[i].columnName] = true;
            }

            for(var i = 0; i < fieldNames.length; ++i) {
                if(!fieldExists[fieldNames[i]]) {
                    service.dataset.fields.push({
                        columnName: fieldNames[i]
                    });
                }
            }
        };

        service.getMappings = function() {
            return service.dataset.mappings;
        };

        service.getMapping = function(key) {
            return service.dataset.mappings[key];
        };

        service.setMapping = function(key, field) {
            service.dataset.mappings[key] = field;
        };

        return service;
    }
);
