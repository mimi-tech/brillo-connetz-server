/* eslint-disable no-unreachable */
//const { v4: uuid } = require("uuid");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { constants } = require("../configs");
const { Users } = require("../models");
const { generalHelperFunctions } = require("../helpers");
//const { EmailService } = require("../helpers/emailService");
const { SendOtp } = require("../helpers/smsService");
const { request } = require("../helpers");

/**
 * Display welcome text
 * @param {Object} params  no params.
 * @returns {Promise<Object>} Contains status, and returns message
 */
const welcomeText = async () => {
  try {
    return {
      status: true,
      message: "welcome to BrilloConnetz app authentication service",
    };
  } catch (error) {
    return {
      status: false,
      message: constants.SERVER_ERROR("WELCOME TEXT"),
    };
  }
};

/**
 * login any in app user
 * @param {Object} params  contains email, password and accountTypes.
 * @returns {Promise<Object>} Contains status, and returns message
 */
const generalLogin = async (params) => {
  try {
    const { email, phoneNumber, password } = params;

  

    const userExist = await Users.findOne({
      $or: [
      
        { email: email },
        { phoneNumber: phoneNumber },
      ]
      
      });

    if (!userExist) {
      return {
        status: false,
        message: "incorrect credentials!",
      };
    }
    //extract and store existing encrypted user password
    const existingUserPassword = userExist.password;

    //validate incoming user password with existing password
    const isPasswordCorrect = await bcrypt.compare(
      password,
      existingUserPassword
    );

    if (!isPasswordCorrect) {
      return {
        status: false,
        message: "incorrect credentials",
      };
    }

   
    

    const { email: _email, phone, _username, _id } = userExist;

    const serializeUserDetails = {_email, phone, _username, _id };

    const accessToken = jwt.sign(serializeUserDetails, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN,
    });

    return {
      status: true,
      message: "success",
      token: accessToken,
      data: userExist,
    };
  } catch (error) {
    return {
      status: false,
      message: constants.SERVER_ERROR("LOGIN"),
    };
  }
};

/**
 * for creating account for a user
 * @param {Object} params email, password, username, profileImageUrl.
 * @returns {Promise<Object>} Contains status, and returns data and message
 */
const userRegistration = async (params) => {
  try {
    const {
      email,
      password,
      phoneNumber,
      username,
      profileImageUrl,
      interest,
      firstName,
      lastName,
      
    } = params;


    //check if  account is already registered
    const userAccount = await Users.findOne({
      email: email
    });

    if (userAccount) {
      return {
        status: false,
        message: "email already exist",
      };
    }

    //check if phone number is already registered
    const phoneNumberInUse = await Users.findOne({
      phoneNumber: phoneNumber,
    });

    if (phoneNumberInUse) {
      return {
        status: false,
        message: "This phone number is in use",
      };
    }

    //check if user name is already registered
    const userNameInUse = await Users.findOne({
      username: username,
    });

    if (userNameInUse) {
      return {
        status: false,
        message: "This user name is in use",
      };
    }

    //encrypt password
    const hashedPassword = await bcrypt.hash(password, 10);

    
     // generate phone number code
 
     const phoneNumberCode = generalHelperFunctions.generatePhoneNumberCode();
     const message = `Otp number${phoneNumberCode}`;
     

     //send otp to user phone number
    await SendOtp.sendOtpToPhone(phoneNumber, message);
    
    
    //send emailCode to user email
  const body ={ 
     email: email,
    subject:"BrilloCOnntez Account Verification",
    message: phoneNumberCode.toString()
  }

//for sending account verification code to email
  const {status: getuserStatus,  message: getUserMessage, } = await request(
    `${process.env.EMAIL_SERVICE_BASE_URL}/send-email`,
    "post",body
  );
  
  if (getuserStatus === false) {
    return {
      status: getuserStatus,
      message: getUserMessage,
    };
  }
  
    //create account
    const newUserAccount = await Users.create({
      email: email,
      password: hashedPassword,
      profileImageUrl: profileImageUrl,
      interest: interest,
      phoneNumber: phoneNumber,
      username: username,
      isPhoneNumberVerified:true,
      firstName: firstName,
      lastName: lastName,
      verificationCode:phoneNumberCode
    });
    
   

 

    const publicData = {
      id: newUserAccount._id,
      email: newUserAccount.email,
      profileImageUrl: newUserAccount.profileImageUrl,
      isPhoneNumberVerified: newUserAccount.isPhoneNumberVerified,
      phoneNumber: newUserAccount.phoneNumber,
      username: newUserAccount.username,
      interest: newUserAccount.interest,
      firstName: newUserAccount.firstName,
      lastName: newUserAccount.lastName,
    }

    return {
      status: true,
      message: "Account created successfully",
      data: publicData,
    };
  } catch (error) {
    return {
      status: false,
      message: constants.SERVER_ERROR("USER APP ACCOUNT"),
    };
  }
};

/**
 * for validating sent auth codes
 * @param {Object} params  user id {authId,emailcode} params needed.
 * @returns {Promise<Object>} Contains status, and returns data and message
 */
 const validateAuthCodes = async (params) => {
  try {
    const { authId, verificationCode } = params;

    //check if authId is valid
    const user = await Users.findOne({
      _id: authId,
    });

    if (!user) {
      return {
        status: false,
        message: "invalid authId",
      };
    }





    const authCodes = {
      _id: authId,
      verificationCode: verificationCode,
     
    }



    //check if user auth codes are valid
    const isAccountCodeValid = await Users.findOne(authCodes);


    if (!isAccountCodeValid) {
      return {
        status: false,
        message: "invalid code match",
      };
    }


    const filter = { _id: authId };
    const update = { isAccountVerified: true };
    await Users.findOneAndUpdate(filter, update, {
      new: true,
    });

    // const { email: _email, _id, phoneNumber } = user;

    // const serializeUserDetails = { _email, _id, phoneNumber };

    // //authenticate the user if email code is valid
    // const accessToken = jwt.sign(serializeUserDetails, process.env.JWT_SECRET, {
    //   expiresIn: process.env.JWT_EXPIRES_IN,
    // });



    return {
      status: true,
      message: "authentication codes verified successfully:",
    };
  } catch (e) {
    return {
      status: false,
      message: constants.SERVER_ERROR(" AUTH CODES VERIFICATION"),
    };
  }
};

/**
 * validates user token
 * @param {Object} params  contains email, password and roles.
 * @returns {Promise<Object>} Contains status, and returns message
 */
const validateUserToken = async (params) => {
  try {
    const { token } = params;

    let loggedInUser;

    //verify jwt token
    const check = jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
      if (err) {
        return {
          status: false,
        };
      }

      loggedInUser = user;

      return {
        status: true,
      };
    });

    if (!check.status) {
      return {
        status: false,
        message: "Invalid Token",
      };
    }

    //fetch loggedinuser details
    const _user = await Users.findOne({ email: loggedInUser._email });

    //const { accountType } = _user;

    //const userDetails = await generalHelperFunctions.formatRegistrationResult(accountType, _user.dataValues);

    return {
      status: true,
      message: "success",
      data: _user,
    };
  } catch (error) {
    return {
      status: false,
      message: constants.SERVER_ERROR("TOKEN VERIFICATION"),
    };
  }
};








/**
 * for fetching a user from sparksUsers collection[inservice endpoint]
 * @param {Object} params  user id {authId} params needed.
 * @returns {Promise<Object>} Contains status, and returns data and message
 */

const getAUser = async (params) => {
  const { authId } = params;
  try {
    const user = await Users.findOne({ _id: authId });

    if (!user) {
      return {
        status: false,
        message: "User not found",
      };
    }

    return {
      status: true,
      data: user,
    };
  } catch (e) {
  
    return {
      status: false,
      message: constants.SERVER_ERROR("ACCOUNT GETTING A USER"),
    };
  }
};


/**
 * for updating  account details
 * @param {Object} params  user id {authId} params needed.
 * @returns {Promise<Object>} Contains status, and returns data and message
 */

const updateAuthData = async (params) => {
  try {
    const {
      authId,
      username,
    
    } = params;

    //check if auth id exist
    const checkIfAccountExist = await Users.findOne({
      _id: authId,
    });

    if (!checkIfAccountExist) {
      return {
        status: false,
        message: "invalid auth Id",
      };
    }

    if (username) {
      //check if the username still belongs to the user
      const isYourUsername = await Users.findOne({
        _id: authId ,username: username 
      
      });

      if (!isYourUsername) {
        //check if username already exist
        const checkIfUsernameAlreadyExist = await Users.findOne({
          username: username,
        });

        if (checkIfUsernameAlreadyExist) {
          return {
            status: false,
            message: "username already taken",
          };
        }
      }
    

    

      const filter = { _id: authId };
      const update = {
        username: username,
       
        
      };
      await Users.findOneAndUpdate(filter, update, {
        new: true,
      });
    }

    return {
      status: true,
      message: "Account updated successfully",
    };
  } catch (e) {
    return {
      
      status: false,
      message: constants.SERVER_ERROR("UPDATE USER APP AUTH DATA"),
    };
  }
};

/**
 * for deleting an account either  using the users ID
 * @param {Object} params  user id {authId} params needed.
 * @returns {Promise<Object>} Contains status, and returns data and message
 */

const deleteAUser = async (params) => {
  try {
    const { authId } = params;

    //check if the user is already existing
    const user = await Users.findOne({
      _id: authId,
    });

    if (!user) {
      return {
        status: false,
        message: "User does not exist",
      };
    }

    //go ahead and delete the account
    await Users.deleteOne({
      _id: authId,
    });

    return {
      status: true,
      message: "Account deleted successfully",
    };
  } catch (e) {
    return {
      status: false,
      message: constants.SERVER_ERROR("DELETING USER APP ACCOUNT"),
    };
  }
};




/**
 * Update password endpoint
 * @param {Object} params email and password.
 * @returns {Promise<Object>} Contains status, and returns data and message
 */
const forgotPassword = async (params) => {
  try {
    const { email, password } = params;

     //check if the user email is already existing
     const user = await Users.findOne({
      email: email,
    });

    if (!user) {
      return {
        status: false,
        message: "User does not exist",
      };
    }

    //encrypt password
    const hashedPassword = await bcrypt.hash(password, 10);

    //update password

    
    await Users.updateOne(
      { email: email },
      {
        password: hashedPassword,
      }
    );

    return {
      status: true,
      message: "Password updated successfully. You may now login",
    };
  } catch (e) {
    return {
      status: false,
      message: constants.SERVER_ERROR("UPDATE PASSWORD VERIFICATION ENDPOINT"),
    };
  }
};



/**
 * Update users email address
 * @param {Object} params email, authId.
 * @returns {Promise<Object>} Contains status, and returns data and message
 */

 const updateEmailAddress = async (params) => {
  try {
    const { authId, oldEmail, newEmail,phoneNumber } = params;

    //check if its actually the user changing his/her email
    const isUserEmail = await Users.findOne({
      $and: [
      
        { email: oldEmail },
        { phoneNumber: phoneNumber },
      ]
      
    });

    if (!isUserEmail) {
      return {
        status: false,
        message: "Sorry you are not the owner of this account",
      };
    }



    //check if user exist in the database

    const isMemberExisting = await Users.findOne({
      _id: authId,
    });

    if (!isMemberExisting) {
      return {
        status: false,
        message: "Invalid user",
      };
    }

    //check if email already exist in the database

    const isEmailExisting = await Users.findOne({
      email: newEmail,
    });

    if (isEmailExisting) {
      return {
        status: false,
        message: "Email already exist",
      };
    }

    // If email address is not existing; update new email address in the database for this user

    const filter = { _id: authId };
      const update = {
        email: newEmail,
       
        
      };
      await Users.findOneAndUpdate(filter, update, {
        new: true,
      });

   

    return {
      status: true,
      message: "Email updated successfully",
    };
  } catch (error) {
    return {
      status: false,
      message: constants.SERVER_ERROR("EMAIL ADDRESS"),
    };
  }
};




/**
 * Update password endpoint
 * @param {Object} params email and password.
 * @returns {Promise<Object>} Contains status, and returns data and message
 */
 const matchUsers = async (params) => {
  try {
    const { authId, interest, page } = params;
    const pageCount = 15;
     //check if the user email is already existing
     const user = await Users.findOne({
      _id: authId,
    });

    if (!user) {
      return {
        status: false,
        message: "User does not exist",
      };
    }

   //match users

   const allUsers = await Users.find({
    
    interest:interest,
    _id: { $ne: authId },
   
  })
    .limit(pageCount)
    .skip(pageCount * (page - 1))
    .exec();

   if(!allUsers){
    return {
      status: false,
      data:"You have no interest match yet"
    };
   }

    return {
      status: true,
      data:allUsers
    };


  } catch (e) {
    return {
      status: false,
      message: constants.SERVER_ERROR("MATCH USERS"),
    };
  }
};


/**
 * for fetching a user from sparksUsers collection[inservice endpoint]
 * @param {Object} params  user id {authId} params needed.
 * @returns {Promise<Object>} Contains status, and returns data and message
 */

 const reSendCode = async (params) => {
  const { authId, phoneNumber,email} = params;
  try {
    const user = await Users.findOne({ _id: authId });

    if (!user) {
      return {
        status: false,
        message: "User not found",
      };
    }

    const phoneNumberCode = generalHelperFunctions.generatePhoneNumberCode();
    const message = `Otp number${phoneNumberCode}`;
    

    //send otp to user phone number
   await SendOtp.sendOtpToPhone(phoneNumber, message);
   
   
   //send emailCode to user email
 const body ={ 
    email: email,
   subject:"BrilloCOnntez Account Verification",
   message: phoneNumberCode.toString()
 }

//for sending account verification code to email
 const {status: getuserStatus,  message: getUserMessage, } = await request(
   `${process.env.EMAIL_SERVICE_BASE_URL}/send-email`,
   "post",body
 );
 
 if (getuserStatus === false) {
   return {
     status: getuserStatus,
     message: getUserMessage,
   };
 }
 const filter = { _id: authId };
    
 const update = { verificationCode: phoneNumberCode };
 await Users.findOneAndUpdate(filter, update, {
   new: true,
 });

    return {
      status: true,
      message: "sent successfully",
    };
  } catch (e) {
  
    return {
      status: false,
      message: constants.SERVER_ERROR("RESENDING CODE"),
    };
  }
};


module.exports = {
  welcomeText,
  generalLogin,
  userRegistration,
  validateAuthCodes,
  validateUserToken,
  updateAuthData,
  deleteAUser,
  getAUser,
  
  forgotPassword,
  updateEmailAddress,
  matchUsers,
  reSendCode
  
};
