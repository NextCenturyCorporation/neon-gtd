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

/*
Set username and database in uploadFile.
*/
angular.module('neonDemo.directives')
.directive('importFile', ['ConnectionService', 'ErrorNotificationService', 'ImportService',
    function(connectionService, errorNotificationService, importService) {
    return {
        templateUrl: 'partials/directives/importFile.html',
        restrict: 'EA',
        link: function($scope) {

            $scope.canImport = (window.File && window.FileReader && window.FileList && window.Blob);
            $scope.nameTypePairs = undefined;
            var file;

            $scope.uploadFile = function() {
                importService.setUserName(jQuery('#importUsernameInput')[0].value);
                importService.setDatabaseName(jQuery('#importDatabaseInput')[0].value);
                var connection = connectionService.getActiveConnection();
                if(!connection || !file || !importService.getDatabaseName()) {
                    return;
                }
                var formData = new FormData();
                formData.append('user', importService.getUserName());
                formData.append('data', importService.getDatabaseName());
                formData.append('file', file);
                connection.executeUploadFile(formData, importSuccess, importFail);
                jQuery('#importDatabaseInput')[0].value = '';
            };

            var importSuccess = function(response) {
                var result = JSON.parse(response); // We manually make XMLHttpRequest here, so get no auto-parsing.
                if(result.user) {
                    importService.setUserName(result.user);
                }
                $scope.nameTypePairs = result.types;
                $scope.$apply();
                showConfirmModal();
            };

            var importFail = function(response) {
                window.alert('Failed to import data.'); // TODO eventually need better failure code than this.
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
                var datePattern = jQuery('#dateStringInput')[0].value;
                var toSend = {
                    format: datePattern ? datePattern : undefined,
                    fields: ftPairs
                };
                connection.executeConfirmTypeGuesses(toSend, importService.getUserName(), importService.getDatabaseName(), confirmSuccess, confirmFail);
            }

            var confirmSuccess = function(response) {
                jQuery('#confirmChoicesModal').modal('hide');
            };

            var confirmFail = function(response) {
                $scope.nameTypePairs = response.responseJSON;
                $scope.$apply();
                jQuery('#convertFailedText').show();
                setupDropdowns();
            };

            var showConfirmModal = function() {
                jQuery('#dateStringInput')[0].value = importService.getDateString();
                jQuery('#userNameCreatedText')[0].innerHTML = "Your username is " + importService.getUserName();
                jQuery('#convertFailedText').hide()
                jQuery('#confirmChoicesModal').modal('show');
                setupDropdowns();
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
            };

            var setupDropdowns = function() {
                $scope.nameTypePairs.forEach(function(pair) {
                    var dropdown = document.getElementById(pair.name+"-options");
                    dropdown.value = pair.type;
                    dropdown.addEventListener("change", confirmChoicesDropdownChange, false);
                });
            };

            var displayFileInfo = function(file) {
                document.getElementById("selectedFileIndicator").innerHTML = (file === undefined) ? "No file selected" : 
                    (file.size > importService.getMaxSize(false)) ? "File too large - size limit is " + importService.getMaxSize(true) :
                        file.name + " - " + importService.sizeToReadable(file.size);
                var databaseName = jQuery('#importDatabaseInput')[0].value;
                if(!databaseName) {
                    jQuery('#importDatabaseInput')[0].value = file.name.substring(0, file.name.lastIndexOf('.'));
                }
            }

// =====================================================================================================================
// Define some behaviors for objects in the import modal and the import modal itself.
// =====================================================================================================================

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

            var importModalOnHidden = function(evnt) {
                file = undefined;
                displayFileInfo(file);
            };

            var importModalOnShow = function(evnt) {
                jQuery('#importUsernameInput')[0].value = importService.getUserName();
            }

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
            jQuery("#importModal").on("hidden.bs.modal", importModalOnHidden).on("show.bs.modal", importModalOnShow);
            // Hide the text portion of the file selector element -  we have our own, and it doesn't update when the modal closes and reopens.
            jQuery("#fileSelect").css("color", "transparent");
        }
    };
}]);