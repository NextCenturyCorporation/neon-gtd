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

/**
 * This Angular JS directive adds a button to a page that triggers a modal, which allows the user to upload a file to the server.
 *
 * @namespace neonDemo.directives
 * @constructor
 */
angular.module('neonDemo.directives')
.directive('importFile', ['ConnectionService', 'ImportService',
    function(connectionService, importService) {
    return {
        templateUrl: 'partials/directives/importFile.html',
        restrict: 'EA',
        link: function($scope) {
            $scope.canImport = (window.File && window.FileReader && window.FileList && window.Blob);
            $scope.nameTypePairs = undefined;
            $scope.currentJobID = undefined;
            $scope.isConverting = false;
            $scope.convertingMessage = "";
            var file;
            var pollDelay = 1500; 

            $scope.uploadFile = function() {
                importService.setUserName($('#importUsernameInput')[0].value);
                importService.setDatabaseName($('#importDatabaseInput')[0].value);
                var connection = connectionService.getActiveConnection();
                if(!connection || !file || !importService.getDatabaseName()) {
                    return;
                }
                var formData = new FormData();
                formData.append('user', importService.makeTextSafe(importService.getUserName()));
                formData.append('data', importService.makeTextSafe(importService.getDatabaseName()));
                formData.append('type', file.name.substring(file.name.lastIndexOf('.') + 1));
                formData.append('file', file);
                connection.executeUploadFile(formData, uploadSuccess, uploadFail);
                $('#importDatabaseInput')[0].value = '';
            };

            var uploadFail = function(response) {
                window.alert(response.response[0]); // TODO eventually need better failure code than this.
            };

            var uploadSuccess = function(response) {
                var result = JSON.parse(response); // We manually make XMLHttpRequest when uploading binary data, so get no auto-parsing.
                var jobID = result.jobID;
                $scope.nameTypePairs = result.types;
                $scope.$apply();
                waitForGuesses(jobID);
            };

            var waitForGuesses = function(jobID) {
                var connection = connectionService.getActiveConnection();
                if(!connection || !jobID) {
                    return;
                }
                connection.executeCheckTypeGuesses(jobID, waitForGuessesCallback);
            };

            var waitForGuessesCallback = function(response) {
                if(response.complete) {
                    $scope.nameTypePairs = response.guesses;
                    $scope.currentJobID = response.jobID;
                    $scope.$apply();
                    showConfirmGuessesModal();
                } else {
                    window.setTimeout(function() {
                        waitForGuesses(response.jobID);
                    }, pollDelay);
                }
            };

            $scope.sendConfirmedChoices = function(value) {
                var connection = connectionService.getActiveConnection();
                if(!connection || !$scope.nameTypePairs) {
                    return;
                }
                var ftPairs = importService.getFieldsAndTypes($scope.nameTypePairs);
                if(value && value === 'String') {
                    ftPairs.forEach(function(pair) {
                        pair.type = 'String';
                    });
                }
                var datePattern = $('#dateStringInput')[0].value;
                var toSend = {
                    format: datePattern ? datePattern : undefined,
                    fields: ftPairs
                };
                connection.executeLoadFileIntoDB(toSend, $scope.currentJobID, confirmChoicesSuccess, confirmChoicesFail);
                // Preferably, job ID here would be passed directly from the last time the guesses callback fired, but for now I'll just store it as a variable.
                // (Getting it straight from the last method to use it would be preferable just to continue everything in a nice chain.)
                $scope.isConverting = true;
                $scope.convertingMessage = "Records converted: 0";
            };

            var confirmChoicesSuccess = function(response) {
                waitForUploadComplete(response.jobID);
            };

            var confirmChoicesFail = function() {
                window.alert("Something went wrong when trying to find your file's records to convert and load them.");
            };

            var waitForUploadComplete = function(jobID) {
                var connection = connectionService.getActiveConnection();
                if(!connection || !jobID) {
                    return;
                }
                connection.executeCheckImportProgress(jobID, waitForUploadCompleteCallback);
            };

            var waitForUploadCompleteCallback = function(response) {
                if(response.complete) {
                    $scope.isConverting = false;
                    $scope.$apply();
                    if(response.failedFields.length > 0) {
                        $scope.nameTypePairs = response.failedFields;
                        $scope.$apply();
                        $('#convertFailedText').show();
                        setupConfirmGuessesModalInfo();
                    } else {
                        $("#confirmChoicesModal").modal('hide');
                    }
                } else {
                    if(response.numCompleted < 0) {
                        return; // numCompleted only returns as <0 if the data that the user is trying to convert doesn't exist anymore.
                    }
                    $scope.convertingMessage = "Records converted: " + response.numCompleted;
                    $scope.$apply();
                    window.setTimeout(function() {
                        waitForUploadComplete(response.jobID);
                    }, pollDelay);
                }
            };

            var showConfirmGuessesModal = function() {
                $('#dateStringInput')[0].value = importService.getDateString();
                $('#userNameCreatedText')[0].innerHTML = "Your username is " + importService.getUserName();
                $('#convertFailedText').hide();
                $('#confirmChoicesModal').modal('show');
                setupConfirmGuessesModalInfo();
            };

            var confirmChoicesDropdownChange = function(evnt) {
                evnt.stopPropagation();
                var name = evnt.target.id.split("-")[0];
                var value = evnt.target.value;
                $scope.nameTypePairs.forEach(function(pair) {
                    if(pair.name === name) {
                        pair.type = value;
                    }
                });
                var example = document.getElementById(name + "-example");
                example.innerHTML = getExampleFromTypeName(value);
            };

            var setupConfirmGuessesModalInfo = function() {
                $scope.nameTypePairs.forEach(function(pair) {
                    var dropdown = document.getElementById(pair.name + "-options");
                    dropdown.value = pair.type;
                    dropdown.addEventListener("change", confirmChoicesDropdownChange, false);
                    var example = document.getElementById(pair.name + "-example");
                    example.innerHTML = getExampleFromTypeName(pair.type);
                });
            };

            var displayFileInfo = function(file) {
                var indicator = document.getElementById("selectedFileIndicator");
                if(!file) {
                    indicator.innerHTML = "No file selected";
                    return;
                } else if(file.size > importService.getMaxSize(false)) {
                    indicator.innerHTML = "File too large - size limit is " + importService.getMaxSize(true);
                } else {
                    indicator.innerHTML = file.name + " - " + importService.sizeToReadable(file.size);
                }
                var databaseName = $('#importDatabaseInput')[0].value;
                if(!databaseName) {
                    $('#importDatabaseInput')[0].value = file.name.substring(0, file.name.lastIndexOf('.'));
                }
            };

            var getExampleFromTypeName = function(name) {
                switch(name) {
                    case "Integer": {
                        return "1125";
                    }
                    case "Long": {
                        return "1234567890987654321";
                    }
                    case "Double": {
                        return "1.125";
                    }
                    case "Float": {
                        return "1.234567890987654321";
                    }
                    case "Date": {
                        return "2012-12-21T07:08:09.123Z";
                    }
                    case "String": {
                        return "\"The quick brown fox.\"";
                    }
                    default: {
                        return "No example available; invalid type.";
                    }
                }
            };

            /**
             * =====================================================================================================================
             * Define some behaviors for objects in the import modal and the import modal itself.
             * =====================================================================================================================
             */

            var importModalDragEnter = function(evnt) {
                evnt.stopPropagation();
                evnt.preventDefault();
            };

            var importModalDragOver = function(evnt) {
                evnt.stopPropagation();
                evnt.preventDefault();
                evnt.dataTransfer.dropEffect = "copy";
            };

            var importModalDrop = function(evnt) {
                evnt.stopPropagation();
                evnt.preventDefault();
                var data = evnt.dataTransfer;
                file = data.files[0];
                displayFileInfo(file);
            };

            var importModalFileSelectChange = function(evnt) {
                evnt.stopPropagation();
                evnt.preventDefault();
                file = fileSelector.files[0];
                displayFileInfo(file);
            };

            var importModalOnHidden = function() {
                file = undefined;
                displayFileInfo(file);
            };

            var importModalOnShow = function() {
                $('#importUsernameInput')[0].value = importService.getUserName();
            };

            // Set behavior of drag and drop element within import file modal.
            var dragDrop = document.getElementById("fileDragAndDrop");
            dragDrop.addEventListener("dragenter", importModalDragEnter, false);
            dragDrop.addEventListener("dragover", importModalDragOver, false);
            dragDrop.addEventListener("drop", importModalDrop, false);
            // Set behavior of file selector element within import file modal.
            var fileSelector = document.getElementById("fileSelect");
            fileSelector.addEventListener("dragenter", importModalDragEnter, false);
            fileSelector.addEventListener("dragover", importModalDragOver, false);
            fileSelector.addEventListener("drop", importModalDrop, false);
            fileSelector.addEventListener("change", importModalFileSelectChange, false);
            // Clear selected file and reset text when import modal is hidden, and set username to what it was last time when the modal appears.
            $("#importModal").on("hidden.bs.modal", importModalOnHidden).on("show.bs.modal", importModalOnShow);
            // Hide the text portion of the file selector element -  we have our own, and it doesn't update when the modal closes and reopens.
            $("#fileSelect").css("color", "transparent");
        }
    };
}]);