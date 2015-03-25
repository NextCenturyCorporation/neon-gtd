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
            fields: {}
        }

        service.setActiveDataset = function(dataset) {
            service.dataset = dataset;
        };

        service.hasDataset = function() {
            var dataset = service.dataset;
            return dataset.datastore && dataset.hostname && dataset.database && dataset.table;
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

        service.getFields = function() {
            return service.dataset.fields;
        };

        service.getField = function(field) {
            return service.dataset.fields ? service.dataset.fields[field] : "";
        };

        return service;
    }
);
